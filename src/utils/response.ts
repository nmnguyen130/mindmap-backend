import { Response } from 'express';

interface SuccessResponse<T = any> {
    success: true;
    data: T;
}

interface ErrorResponse {
    success: false;
    error: {
        message: string;
        code?: string;
    };
}

export const success = <T>(res: Response, data: T, statusCode: number = 200) => {
    return res.status(statusCode).json({
        success: true,
        data,
    } as SuccessResponse<T>);
};

export const created = <T>(res: Response, data: T) => {
    return success(res, data, 201);
};

export const error = (res: Response, message: string, statusCode: number = 500, code?: string) => {
    return res.status(statusCode).json({
        success: false,
        error: {
            message,
            code,
        },
    } as ErrorResponse);
};
