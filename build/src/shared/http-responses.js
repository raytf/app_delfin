import { getCurrentUTCDate } from './utils/date';
export const buildSuccessResponse = (data, message = 'Success', statusCode = 200) => ({
    data,
    message,
    statusCode,
    timestamp: getCurrentUTCDate(),
});
export const sendSuccessResponse = (response, data, message = 'Success', statusCode = 200) => {
    const responseBody = buildSuccessResponse(data, message, statusCode);
    return response.status(statusCode).json(responseBody);
};
