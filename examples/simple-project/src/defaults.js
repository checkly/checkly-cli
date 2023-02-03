"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaults = void 0;
exports.defaults = {
    pageUrl: process.env.ENVIRONMENT_URL || 'https://checklyhq.com',
    playwright: {
        viewportSize: { width: 1920, height: 1080 },
    },
};
