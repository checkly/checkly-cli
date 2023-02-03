"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var directory_js_1 = require("../directory.js");
describe('isValidProjectDirectory()', function () {
    var cases = [
        [path.join(__dirname, './fixtures/valid-dir'), true],
        [path.join(__dirname, './fixtures/invalid-dir-1'), false],
    ];
    test.each(cases)('directory %s should return valid = %s', function (dir, expected) {
        expect((0, directory_js_1.isValidProjectDirectory)(dir)).toEqual(expected);
    });
});
