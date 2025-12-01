"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/index.ts'
            ],
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 95, // 97.82% actual, allows for defensive code paths
                statements: 100
            }
        }
    }
});
//# sourceMappingURL=vitest.config.js.map