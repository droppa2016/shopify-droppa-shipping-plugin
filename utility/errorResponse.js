class ErrorResponse extends Error {
    constructor(message, statusCode) {
        // custom properties
        super(message);
        this.statusCode = statusCode
    }
}

module.exports = ErrorResponse;