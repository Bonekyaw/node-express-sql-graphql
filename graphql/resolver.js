require("dotenv").config();
const { Op } = require("sequelize");

const db = require("../models");
const Admin = db.admins;
const Otp = db.otps;

const asyncHandler = require("express-async-handler");
// const { v4: uuidv4 } = require("uuid");
const moment = require("moment");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const validator = require("validator");
const { GraphQLError } = require("graphql");

const {
  checkPhoneExist,
  checkPhoneIfNotExist,
  validatePhone,
  checkOtpErrorIfSameDate,
  checkOtpPhone,
  checkAdminExist,
} = require("../utils/check");
const isAuth = require("../utils/isAuth");
const { withCount, noCount, cursor } = require("../utils/paginate");
const authorise = require("../utils/authorise");

const rand = () => Math.random().toString(36).substring(2);

module.exports = {
  register: asyncHandler(async ({ phone }, req) => {
    const phoneNumber = validatePhone(phone);

    const admin = await Admin.findOne({
      where: { phone: phoneNumber },
    });
    checkPhoneExist(admin);

    // OTP processing eg. Sending OTP request to Operator
    const otpCheck = await Otp.findOne({
      where: { phone: phoneNumber },
    });
    const token = rand() + rand();
    if (!otpCheck) {
      const otp = {
        phone: phoneNumber,
        otp: "123456", // fake OTP
        rememberToken: token,
        count: 1,
      };
      await Otp.create(otp);
    } else {
      const lastRequest = new Date(otpCheck.updatedAt).toLocaleDateString();
      const isSameDate = lastRequest == new Date().toLocaleDateString();

      checkOtpErrorIfSameDate(isSameDate, otpCheck);

      if (!isSameDate) {
        otpCheck.otp = "123456"; // Should replace new OTP
        otpCheck.rememberToken = token;
        otpCheck.count = 1;
        otpCheck.error = 0; // reset error count
        await otpCheck.save();
      } else {
        if (otpCheck.count === 3) {
          throw new GraphQLError(
            "OTP requests are allowed only 3 times per day. Please try again tomorrow,if you reach the limit.",
            {
              extensions: {
                code: "METHOD NOT ALLOWED",
                http: { status: 405 },
              },
            }
          );
        } else {
          otpCheck.otp = "123456"; // Should replace new OTP
          otpCheck.rememberToken = token;
          otpCheck.count += 1;
          await otpCheck.save();
        }
      }
    }

    return {
      message: `We are sending OTP to 09${phoneNumber}.`,
      phone: phoneNumber,
      token: token,
    };
  }),

  verifyOtp: asyncHandler(async ({ userInput }, req) => {
    let token;
    let phone = validatePhone(userInput.phone);
    let otp = userInput.otp;

    // Start validation
    if (validator.isEmpty(userInput.token.trim())) {
      throw new GraphQLError("Token must not be empty.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    if (
      validator.isEmpty(otp.trim()) ||
      !validator.isLength(otp, { min: 5, max: 12 }) ||
      !validator.matches(otp, "^[0-9]+$")
    ) {
      throw new GraphQLError("OTP is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }

    token = validator.escape(userInput.token);

    // End validation

    const admin = await Admin.findOne({
      where: { phone: phone },
    });
    checkPhoneExist(admin);

    const otpCheck = await Otp.findOne({
      where: { phone: phone },
    });
    checkOtpPhone(otpCheck);

    // Wrong OTP allowed 5 times per day
    const lastRequest = new Date(otpCheck.updatedAt).toLocaleDateString();
    const isSameDate = lastRequest == new Date().toLocaleDateString();

    checkOtpErrorIfSameDate(isSameDate, otpCheck);

    if (otpCheck.rememberToken !== token) {
      otpCheck.error = 5;
      await otpCheck.save();

      throw new GraphQLError("Token is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    const difference = moment() - moment(otpCheck.updatedAt);
    console.log("Diff", difference);

    if (difference > 90000) {
      // expire at 1 min 30 sec
      throw new GraphQLError("OTP is expired.", {
        extensions: {
          code: "FORBIDDEN",
          http: { status: 403 },
        },
      });
    }

    if (otpCheck.otp !== otp) {
      // ----- Starting to record wrong times --------
      if (!isSameDate) {
        otpCheck.error = 1;
        await otpCheck.save();
      } else {
        otpCheck.error += 1;
        await otpCheck.save();
      }
      // ----- Ending -----------
      throw new GraphQLError("OTP is incorrect.", {
        extensions: {
          code: "UNAUTHORIZED",
          http: { status: 401 },
        },
      });
    }

    const randomToken = rand() + rand() + rand();
    otpCheck.verifyToken = randomToken;
    otpCheck.count = 1;
    otpCheck.error = 1; // reset error count
    await otpCheck.save();

    return {
      message: "Successfully OTP is verified",
      phone: phone,
      token: randomToken,
    };
  }),

  confirmPassword: asyncHandler(async ({ token, userInput }, req) => {
    let phone = validatePhone(userInput.phone);
    let password = userInput.password;

    // Start validation
    if (validator.isEmpty(token.trim())) {
      throw new GraphQLError("Token must not be empty.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    if (
      validator.isEmpty(password.trim()) ||
      !validator.isLength(password, { min: 8, max: 8 }) ||
      !validator.matches(password, "^[0-9]+$")
    ) {
      throw new GraphQLError("OTP is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }

    token = validator.escape(token);

    // End validation

    const admin = await Admin.findOne({
      where: { phone: phone },
    });
    checkPhoneExist(admin);

    const otpCheck = await Otp.findOne({
      where: { phone: phone },
    });
    checkOtpPhone(otpCheck);

    if (otpCheck.error === 5) {
      throw new GraphQLError(
        "This request may be an attack. If not, try again tomorrow.",
        {
          extensions: {
            code: "UNAUTHORIZED",
            http: { status: 401 },
          },
        }
      );
    }

    if (otpCheck.verifyToken !== token) {
      otpCheck.error = 5;
      await otpCheck.save();

      throw new GraphQLError("Token is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }

    const difference = moment() - moment(otpCheck.updatedAt);
    // console.log("Diff", difference);

    if (difference > 300000) {
      // will expire after 5 min
      throw new GraphQLError("Your request is expired. Please try again.", {
        extensions: {
          code: "FORBIDDEN",
          http: { status: 403 },
        },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);
    const randomToken = rand() + rand() + rand();

    const newAdmin = new Admin({
      phone: phone,
      password: hashPassword,
      randToken: randomToken,
    });
    await newAdmin.save();

    // jwt token
    let payload = { id: newAdmin.id };
    const jwtToken = jwt.sign(payload, process.env.TOKEN_SECRET, {
      expiresIn: "1h",
    });

    return {
      message: "Successfully created an account.",
      token: jwtToken,
      phone: phone,
      userId: newAdmin.id,
      randomToken: randomToken,
    };
  }),

  login: asyncHandler(async ({ userInput }, req) => {
    let phone = validatePhone(userInput.phone);
    let password = userInput.password;

    // Start validation
    if (
      validator.isEmpty(password.trim()) ||
      !validator.isLength(password, { min: 8, max: 8 }) ||
      !validator.matches(password, "^[0-9]+$")
    ) {
      throw new GraphQLError("Validation failed.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    // End validation

    const admin = await Admin.findOne({
      where: { phone: phone },
    });
    checkPhoneIfNotExist(admin);

    // Wrong Password allowed 3 times per day
    if (admin.status === "freeze") {
      throw new GraphQLError(
        "Your account is temporarily locked. Please contact us.",
        {
          extensions: {
            code: "UNAUTHORIZED",
            http: { status: 401 },
          },
        }
      );
    }

    const isEqual = await bcrypt.compare(password, admin.password);
    if (!isEqual) {
      // ----- Starting to record wrong times --------
      const lastRequest = new Date(admin.updatedAt).toLocaleDateString();
      const isSameDate = lastRequest == new Date().toLocaleDateString();

      if (!isSameDate) {
        admin.error = 1;
        await admin.save();
      } else {
        if (admin.error >= 2) {
          admin.status = "freeze";
          await admin.save();
        } else {
          admin.error += 1;
          await admin.save();
        }
      }
      // ----- Ending -----------
      throw new GraphQLError("Password is wrong.", {
        extensions: {
          code: "UNAUTHORIZED",
          http: { status: 401 },
        },
      });
    }

    const randomToken = rand() + rand() + rand();
    if (admin.error >= 1) {
      admin.error = 0;
      admin.randToken = randomToken;
      await admin.save();
    } else {
      admin.randToken = randomToken;
      await admin.save();
    }

    let payload = { id: admin.id };
    const jwtToken = jwt.sign(payload, process.env.TOKEN_SECRET, {
      expiresIn: "1h",
    });

    return {
      message: "Successfully Logged In.",
      token: jwtToken,
      phone: phone,
      userId: admin.id,
      randomToken: randomToken,
    };
  }),

  uploadProfile: asyncHandler(async ({ userInput }, req) => {
    let imageUrl = userInput.imageUrl;
    let token = req.authHeader.split(" ")[1];

    // Start validation
    if (validator.isEmpty(token.trim()) || !validator.isJWT(token)) {
      throw new GraphQLError("Token must not be invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    if (
      validator.isEmpty(imageUrl.trim()) ||
      !validator.matches(imageUrl, "^uploads/images/.*.(png|jpg|jpeg)$")
    ) {
      throw new GraphQLError("This image url is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }

    token = validator.escape(token);
    imageUrl = validator.escape(imageUrl);

    // End validation

    const adminId = isAuth(token);

    const admin = await Admin.findByPk(adminId);
    checkAdminExist(admin);
    authorise(false, admin, "user");

    admin.profile = imageUrl;
    await admin.save();

    return {
      message: "Successfully uploaded your profile picture.",
      imageUrl: validator.unescape(imageUrl), // Don't forget to unescape.
    };
  }),

  refreshToken: asyncHandler(async ({ userInput }, req) => {
    const { userId, randomToken } = userInput;
    const token = req.authHeader.split(" ")[1];

    // Start validation
    if (validator.isEmpty(token.trim()) || !validator.isJWT(token)) {
      throw new GraphQLError("Token must not be invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    if (!validator.isInt(userId) || validator.isEmpty(randomToken.trim())) {
      throw new GraphQLError("User input is invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }
    // End Validation

    const admin = await Admin.findByPk(userId);
    checkAdminExist(admin);

    if (admin.randToken !== randomToken) {
      admin.error = 5;
      await admin.save();

      throw new GraphQLError(
        "This request may be an attack. Please contact the admin team.",
        {
          extensions: {
            code: "BAD REQUEST",
            http: { status: 400 },
          },
        }
      );
    }

    const randToken = rand() + rand() + rand();

    admin.randToken = randToken;
    await admin.save();

    // jwt token
    let payload = { id: userId };
    const jwtToken = jwt.sign(payload, process.env.TOKEN_SECRET, {
      expiresIn: "1h",
    });

    return {
      message: "Successfully sent a new token.",
      token: jwtToken,
      userId: userId,
      randomToken: randToken,
    };
  }),

  // Pagination Query
  paginateAdmins: asyncHandler(async (args, req) => {
    let { page, limit } = args;
    const token = req.authHeader.split(" ")[1];
    
    // Start validation
    if (validator.isEmpty(token.trim()) || !validator.isJWT(token)) {
      throw new GraphQLError("Token must not be invalid.", {
        extensions: {
          code: "BAD REQUEST",
          http: { status: 400 },
        },
      });
    }

    const adminId = isAuth(token);

    const admin = await Admin.findByPk(adminId);
    checkAdminExist(admin);
    authorise(false, admin, "user");

    // cursor = cursor && validator.escape(cursor);
    // End Validation

    const filters = {
      status: "active",
    };
    const order = [['createdAt', 'DESC']];

    return withCount(Admin, page, limit, filters, order);
    // return noCount(Admin, page, limit, filters, order);
    // let cursors = page;
    // return cursor(Admin, cursors, limit, filters, order);
  }),

  //
};
