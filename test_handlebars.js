import Handlebars from 'handlebars';

// Test what happens when accessing undefined properties
const template1 = Handlebars.compile("{{{sharedRules.continuity}}}");
const template2 = Handlebars.compile("{{{sharedRules.nonExistent}}}");
const template3 = Handlebars.compile("Hello {{name}}");
const template4 = Handlebars.compile("Hello {{{name}}}");

console.log("Test 1: sharedRules.continuity (undefined):");
console.log("Result:", template1({}));
console.log("");

console.log("Test 2: sharedRules.nonExistent (undefined):");
console.log("Result:", template2({}));
console.log("");

console.log("Test 3: name (undefined, escaped):");
console.log("Result:", template3({}));
console.log("");

console.log("Test 4: name (undefined, unescaped):");
console.log("Result:", template4({}));
console.log("");

console.log("Test 5: nested object with undefined property:");
const template5 = Handlebars.compile("{{{sharedRules.continuity}}}");
console.log("Result:", template5({ sharedRules: { otherRule: 'content' } }));
console.log("");

console.log("Test 6: empty object:");
const template6 = Handlebars.compile("{{{sharedRules.continuity}}}");
console.log("Result:", template6({ sharedRules: {} }));
console.log("");

console.log("Test 7: defined property:");
const template7 = Handlebars.compile("{{{sharedRules.continuity}}}");
console.log("Result:", template7({ sharedRules: { continuity: 'This is continuity content' } }));
