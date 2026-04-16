import { getRPC } from "./rpc-helper";

export const uiLogger = {
    info: (msg: string, context = "UI") => {
        console.info(`[${context}]`, msg);
        getRPC()?.request.logMessage({ level: "info", message: msg, context });
    },
    warn: (msg: string, context = "UI") => {
        console.warn(`[${context}]`, msg);
        getRPC()?.request.logMessage({ level: "warn", message: msg, context });
    },
    error: (msg: string, context = "UI", err?: Error) => {
        const fullMsg = err ? `${msg}: ${err.message}` : msg;
        console.error(`[${context}]`, fullMsg);
        getRPC()?.request.logMessage({ level: "error", message: fullMsg, context });
    }
};
