const { buildSchema } = require("graphql");

module.exports = buildSchema(`
    type Otp {
        _id: ID!
        phone: String!
        otp: String!
        rememberToken: String!
        verifyToken: String
        count: Int!
        error: Int
        createdAt: String!
        updatedAt: String!
    }

    type Admin {
        _id: ID!
        name: String
        phone: String!
        password: String!
        role: String
        status: String
        lastLogin: String
        error: Int
        profile: String
        createdAt: String!
        updatedAt: String!
    }

    type PhoneCheckResponse {
        message: String!
        phone: String!
        token: String!
    }

    type AuthDataResponse {
        message: String!
        token: String!
        phone: String!
        userId: String!
    }

    type UploadedProfileResponse {
        message: String!
        imageUrl: String!
    }

    input OtpCheckInput {
        token: String!
        phone: String!
        otp: String!
    }

    input PasswordConfirmInput {
        phone: String!
        password: String!
    }

    input AuthUser {
        phone: String!
        password: String!
    }

    input UploadFileInput {
        token: String!
        imageUrl: String!
    }

    type RootQuery {
        admins: Admin!
    }

    type RootMutation {
        register(phone: String!): PhoneCheckResponse
        verifyOtp(userInput: OtpCheckInput): PhoneCheckResponse
        confirmPassword(token: String!, userInput: PasswordConfirmInput): AuthDataResponse
        login(userInput: PasswordConfirmInput): AuthDataResponse
        uploadProfile(userInput: UploadFileInput): UploadedProfileResponse
    }

    schema {
        query: RootQuery
        mutation: RootMutation
    }
`);