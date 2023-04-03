"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makePlugin = void 0;
const babel_import_util_1 = require("babel-import-util");
const expression_parser_1 = require("./expression-parser");
const js_utils_1 = require("./js-utils");
__exportStar(require("./public-types"), exports);
const INLINE_PRECOMPILE_MODULES = [
    {
        moduleName: 'ember-cli-htmlbars',
        export: 'hbs',
        allowTemplateLiteral: true,
        enableScope: false,
    },
    {
        moduleName: 'ember-cli-htmlbars-inline-precompile',
        export: 'default',
        allowTemplateLiteral: true,
        enableScope: false,
    },
    {
        moduleName: 'htmlbars-inline-precompile',
        export: 'default',
        allowTemplateLiteral: true,
        enableScope: false,
    },
    {
        moduleName: '@ember/template-compilation',
        export: 'precompileTemplate',
        allowTemplateLiteral: false,
        enableScope: true,
    },
];
function makePlugin(loadOptions) {
    return function htmlbarsInlinePrecompile(babel) {
        let t = babel.types;
        return {
            visitor: {
                Program: {
                    enter(path, state) {
                        state.normalizedOpts = Object.assign({ targetFormat: 'wire', outputModuleOverrides: {}, enableLegacyModules: [], transforms: [] }, loadOptions(state.opts));
                        state.templateFactory = templateFactoryConfig(state.normalizedOpts);
                        state.util = new babel_import_util_1.ImportUtil(t, path);
                        state.program = path;
                    },
                    exit(_path, state) {
                        if (state.normalizedOpts.targetFormat === 'wire') {
                            for (let { moduleName, export: exportName } of configuredModules(state)) {
                                state.util.removeImport(moduleName, exportName);
                            }
                        }
                    },
                },
                TaggedTemplateExpression(path, state) {
                    let tagPath = path.get('tag');
                    if (!tagPath.isIdentifier()) {
                        return;
                    }
                    let options = referencesInlineCompiler(tagPath, state);
                    if (!options) {
                        return;
                    }
                    if (!options.allowTemplateLiteral) {
                        throw path.buildCodeFrameError(`Attempted to use \`${tagPath.node.name}\` as a template tag, but it can only be called as a function with a string passed to it: ${tagPath.node.name}('content here')`);
                    }
                    if (path.node.quasi.expressions.length) {
                        throw path.buildCodeFrameError('placeholders inside a tagged template string are not supported');
                    }
                    let template = path.node.quasi.quasis.map((quasi) => quasi.value.cooked).join('');
                    if (state.normalizedOpts.targetFormat === 'wire') {
                        insertCompiledTemplate(babel, state, template, path, {});
                    }
                    else {
                        insertTransformedTemplate(babel, state, template, path, {}, options);
                    }
                },
                CallExpression(path, state) {
                    let calleePath = path.get('callee');
                    if (!calleePath.isIdentifier()) {
                        return;
                    }
                    let options = referencesInlineCompiler(calleePath, state);
                    if (!options) {
                        return;
                    }
                    let [firstArg, secondArg, ...restArgs] = path.get('arguments');
                    let template;
                    switch (firstArg === null || firstArg === void 0 ? void 0 : firstArg.node.type) {
                        case 'StringLiteral':
                            template = firstArg.node.value;
                            break;
                        case 'TemplateLiteral':
                            if (firstArg.node.expressions.length) {
                                throw path.buildCodeFrameError('placeholders inside a template string are not supported');
                            }
                            else {
                                template = firstArg.node.quasis.map((quasi) => quasi.value.cooked).join('');
                            }
                            break;
                        case 'TaggedTemplateExpression':
                            throw path.buildCodeFrameError(`tagged template strings inside ${calleePath.node.name} are not supported`);
                        default:
                            throw path.buildCodeFrameError(`${calleePath.node.name} should be invoked with at least a single argument (the template string)`);
                    }
                    let userTypedOptions;
                    if (!secondArg) {
                        userTypedOptions = {};
                    }
                    else {
                        if (!secondArg.isObjectExpression()) {
                            throw path.buildCodeFrameError(`${calleePath.node.name} can only be invoked with 2 arguments: the template string, and any static options`);
                        }
                        userTypedOptions = new expression_parser_1.ExpressionParser(babel).parseObjectExpression(calleePath.node.name, secondArg, options.enableScope);
                    }
                    if (restArgs.length > 0) {
                        throw path.buildCodeFrameError(`${calleePath.node.name} can only be invoked with 2 arguments: the template string, and any static options`);
                    }
                    if (state.normalizedOpts.targetFormat === 'wire') {
                        insertCompiledTemplate(babel, state, template, path, userTypedOptions);
                    }
                    else {
                        insertTransformedTemplate(babel, state, template, path, userTypedOptions, options);
                    }
                },
            },
        };
    };
}
exports.makePlugin = makePlugin;
function* configuredModules(state) {
    for (let moduleConfig of INLINE_PRECOMPILE_MODULES) {
        if (moduleConfig.moduleName !== '@ember/template-compilation' &&
            !state.normalizedOpts.enableLegacyModules.includes(moduleConfig.moduleName)) {
            continue;
        }
        yield moduleConfig;
    }
}
function referencesInlineCompiler(path, state) {
    for (let moduleConfig of configuredModules(state)) {
        if (path.referencesImport(moduleConfig.moduleName, moduleConfig.export)) {
            return moduleConfig;
        }
    }
    return undefined;
}
function runtimeErrorIIFE(babel, replacements) {
    let statement = babel.template(`(function() {\n  throw new Error('ERROR_MESSAGE');\n})();`)(replacements);
    return statement.expression;
}
function buildPrecompileOptions(babel, target, state, template, userTypedOptions) {
    if (!userTypedOptions.locals) {
        userTypedOptions.locals = [];
    }
    let jsutils = new js_utils_1.JSUtils(babel, state, target, userTypedOptions.locals, state.util);
    let meta = Object.assign({ jsutils }, userTypedOptions === null || userTypedOptions === void 0 ? void 0 : userTypedOptions.meta);
    return Object.assign({
        contents: template,
        meta,
        // TODO: embroider's template-compiler allows this to be overriden to get
        // backward-compatible module names that don't match the real name of the
        // on-disk file. What's our plan for migrating people away from that?
        moduleName: state.filename,
        // This is here so it's *always* the real filename. Historically, there is
        // also `moduleName` but that did not match the real on-disk filename, it
        // was the notional runtime module name from classic ember builds.
        filename: state.filename,
        plugins: {
            ast: state.normalizedOpts.transforms,
        },
    }, userTypedOptions);
}
function insertCompiledTemplate(babel, state, template, target, userTypedOptions) {
    var _a, _b;
    let t = babel.types;
    let options = buildPrecompileOptions(babel, target, state, template, userTypedOptions);
    let precompileResultString;
    if (options.insertRuntimeErrors) {
        try {
            precompileResultString = state.normalizedOpts.compiler.precompile(template, options);
        }
        catch (error) {
            target.replaceWith(runtimeErrorIIFE(babel, { ERROR_MESSAGE: error.message }));
            return;
        }
    }
    else {
        precompileResultString = state.normalizedOpts.compiler.precompile(template, options);
    }
    const keys = Object.keys((_a = options.localsWithNames) !== null && _a !== void 0 ? _a : {}).join(',');
    const values = Object.values((_b = options.localsWithNames) !== null && _b !== void 0 ? _b : {}).join(',');
    let precompileResultAST = babel.parse(`var precompileResult = ((${keys})=>(${precompileResultString}))(${values}); `, {
        babelrc: false,
        configFile: false,
    });
    let templateExpression = precompileResultAST.program.body[0]
        .declarations[0].init;
    t.addComment(templateExpression, 'leading', `\n  ${template.replace(/\*\//g, '*\\/')}\n`, 
    /* line comment? */ false);
    let templateFactoryIdentifier = state.util.import(target, state.templateFactory.moduleName, state.templateFactory.exportName);
    target.replaceWith(t.callExpression(templateFactoryIdentifier, [templateExpression]));
}
function insertTransformedTemplate(babel, state, template, target, userTypedOptions, formatOptions) {
    let t = babel.types;
    let options = buildPrecompileOptions(babel, target, state, template, userTypedOptions);
    let ast = state.normalizedOpts.compiler._preprocess(template, Object.assign(Object.assign({}, options), { mode: 'codemod' }));
    let transformed = state.normalizedOpts.compiler._print(ast);
    if (target.isCallExpression()) {
        target.get('arguments.0').replaceWith(t.stringLiteral(transformed));
        if (options.locals && options.locals.length > 0) {
            if (!formatOptions.enableScope) {
                maybePruneImport(state.util, target.get('callee'));
                target.set('callee', precompileTemplate(state.util, target));
            }
            updateScope(babel, target, options.locals);
        }
    }
    else {
        if (options.locals && options.locals.length > 0) {
            // need to add scope, so need to replace the backticks form with a call
            // expression to precompileTemplate
            maybePruneImport(state.util, target.get('tag'));
            let newCall = target.replaceWith(t.callExpression(precompileTemplate(state.util, target), [t.stringLiteral(transformed)]))[0];
            updateScope(babel, newCall, options.locals);
        }
        else {
            target.get('quasi').get('quasis.0').replaceWith(t.templateElement({ raw: transformed }));
        }
    }
}
function templateFactoryConfig(opts) {
    var _a;
    let moduleName = '@ember/template-factory';
    let exportName = 'createTemplateFactory';
    let overrides = (_a = opts.outputModuleOverrides[moduleName]) === null || _a === void 0 ? void 0 : _a[exportName];
    return overrides
        ? { exportName: overrides[0], moduleName: overrides[1] }
        : { exportName, moduleName };
}
function buildScope(babel, locals) {
    let t = babel.types;
    return t.arrowFunctionExpression([], t.objectExpression(locals.map((name) => t.objectProperty(t.identifier(name), t.identifier(name), false, true))));
}
function updateScope(babel, target, locals) {
    let t = babel.types;
    let secondArg = target.get('arguments.1');
    if (secondArg) {
        let scope = secondArg.get('properties').find((p) => {
            let key = p.get('key');
            return key.isIdentifier() && key.node.name === 'scope';
        });
        if (scope) {
            scope.set('value', buildScope(babel, locals));
        }
        else {
            secondArg.pushContainer('properties', t.objectProperty(t.identifier('scope'), buildScope(babel, locals)));
        }
    }
    else {
        target.pushContainer('arguments', t.objectExpression([t.objectProperty(t.identifier('scope'), buildScope(babel, locals))]));
    }
}
function maybePruneImport(util, identifier) {
    if (!identifier.isIdentifier()) {
        return;
    }
    let binding = identifier.scope.getBinding(identifier.node.name);
    // this checks if the identifier (that we're about to remove) is used in
    // exactly one place.
    if ((binding === null || binding === void 0 ? void 0 : binding.referencePaths.reduce((count, path) => (path.removed ? count : count + 1), 0)) === 1) {
        let specifier = binding.path;
        if (specifier.isImportSpecifier()) {
            let declaration = specifier.parentPath;
            util.removeImport(declaration.node.source.value, name(specifier.node.imported));
        }
    }
    identifier.removed = true;
}
function precompileTemplate(util, target) {
    return util.import(target, '@ember/template-compilation', 'precompileTemplate');
}
function name(node) {
    if (node.type === 'StringLiteral') {
        return node.value;
    }
    else {
        return node.name;
    }
}
exports.default = makePlugin((options) => options);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGx1Z2luLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0EseURBQStDO0FBQy9DLDJEQUF1RDtBQUN2RCx5Q0FBNEQ7QUFJNUQsaURBQStCO0FBVy9CLE1BQU0seUJBQXlCLEdBQW1CO0lBQ2hEO1FBQ0UsVUFBVSxFQUFFLG9CQUFvQjtRQUNoQyxNQUFNLEVBQUUsS0FBSztRQUNiLG9CQUFvQixFQUFFLElBQUk7UUFDMUIsV0FBVyxFQUFFLEtBQUs7S0FDbkI7SUFDRDtRQUNFLFVBQVUsRUFBRSxzQ0FBc0M7UUFDbEQsTUFBTSxFQUFFLFNBQVM7UUFDakIsb0JBQW9CLEVBQUUsSUFBSTtRQUMxQixXQUFXLEVBQUUsS0FBSztLQUNuQjtJQUNEO1FBQ0UsVUFBVSxFQUFFLDRCQUE0QjtRQUN4QyxNQUFNLEVBQUUsU0FBUztRQUNqQixvQkFBb0IsRUFBRSxJQUFJO1FBQzFCLFdBQVcsRUFBRSxLQUFLO0tBQ25CO0lBQ0Q7UUFDRSxVQUFVLEVBQUUsNkJBQTZCO1FBQ3pDLE1BQU0sRUFBRSxvQkFBb0I7UUFDNUIsb0JBQW9CLEVBQUUsS0FBSztRQUMzQixXQUFXLEVBQUUsSUFBSTtLQUNsQjtDQUNGLENBQUM7QUF1REYsU0FBZ0IsVUFBVSxDQUFxQixXQUFrRDtJQUMvRixPQUFPLFNBQVMsd0JBQXdCLENBQ3RDLEtBQW1CO1FBRW5CLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFcEIsT0FBTztZQUNMLE9BQU8sRUFBRTtnQkFDUCxPQUFPLEVBQUU7b0JBQ1AsS0FBSyxDQUFDLElBQXlCLEVBQUUsS0FBZ0M7d0JBQy9ELEtBQUssQ0FBQyxjQUFjLG1CQUNsQixZQUFZLEVBQUUsTUFBTSxFQUNwQixxQkFBcUIsRUFBRSxFQUFFLEVBQ3pCLG1CQUFtQixFQUFFLEVBQUUsRUFDdkIsVUFBVSxFQUFFLEVBQUUsSUFDWCxXQUFXLENBQUMsS0FB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bEI7QUFDSCxDQUFDO0FBRUQsa0JBQWUsVUFBVSxDQUFVLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgTm9kZVBhdGggfSBmcm9tICdAYmFiZWwvdHJhdmVyc2UnO1xuaW1wb3J0IHR5cGUgKiBhcyBCYWJlbCBmcm9tICdAYmFiZWwvY29yZSc7XG5pbXBvcnQgdHlwZSB7IHR5cGVzIGFzIHQgfSBmcm9tICdAYmFiZWwvY29yZSc7XG5pbXBvcnQgeyBJbXBvcnRVdGlsIH0gZnJvbSAnYmFiZWwtaW1wb3J0LXV0aWwnO1xuaW1wb3J0IHsgRXhwcmVzc2lvblBhcnNlciB9IGZyb20gJy4vZXhwcmVzc2lvbi1wYXJzZXInO1xuaW1wb3J0IHsgSlNVdGlscywgRXh0ZW5kZWRQbHVnaW5CdWlsZGVyIH0gZnJvbSAnLi9qcy11dGlscyc7XG5pbXBvcnQgdHlwZSB7IEVtYmVyVGVtcGxhdGVDb21waWxlciwgUHJlcHJvY2Vzc09wdGlvbnMgfSBmcm9tICcuL2VtYmVyLXRlbXBsYXRlLWNvbXBpbGVyJztcbmltcG9ydCB7IExlZ2FjeU1vZHVsZU5hbWUgfSBmcm9tICcuL3B1YmxpYy10eXBlcyc7XG5cbmV4cG9ydCAqIGZyb20gJy4vcHVibGljLXR5cGVzJztcblxudHlwZSBNb2R1bGVOYW1lID0gTGVnYWN5TW9kdWxlTmFtZSB8ICdAZW1iZXIvdGVtcGxhdGUtY29tcGlsYXRpb24nO1xuXG5pbnRlcmZhY2UgTW9kdWxlQ29uZmlnIHtcbiAgbW9kdWxlTmFtZTogTW9kdWxlTmFtZTtcbiAgZXhwb3J0OiBzdHJpbmc7XG4gIGFsbG93VGVtcGxhdGVMaXRlcmFsOiBib29sZWFuO1xuICBlbmFibGVTY29wZTogYm9vbGVhbjtcbn1cblxuY29uc3QgSU5MSU5FX1BSRUNPTVBJTEVfTU9EVUxFUzogTW9kdWxlQ29uZmlnW10gPSBbXG4gIHtcbiAgICBtb2R1bGVOYW1lOiAnZW1iZXItY2xpLWh0bWxiYXJzJyxcbiAgICBleHBvcnQ6ICdoYnMnLFxuICAgIGFsbG93VGVtcGxhdGVMaXRlcmFsOiB0cnVlLFxuICAgIGVuYWJsZVNjb3BlOiBmYWxzZSxcbiAgfSxcbiAge1xuICAgIG1vZHVsZU5hbWU6ICdlbWJlci1jbGktaHRtbGJhcnMtaW5saW5lLXByZWNvbXBpbGUnLFxuICAgIGV4cG9ydDogJ2RlZmF1bHQnLFxuICAgIGFsbG93VGVtcGxhdGVMaXRlcmFsOiB0cnVlLFxuICAgIGVuYWJsZVNjb3BlOiBmYWxzZSxcbiAgfSxcbiAge1xuICAgIG1vZHVsZU5hbWU6ICdodG1sYmFycy1pbmxpbmUtcHJlY29tcGlsZScsXG4gICAgZXhwb3J0OiAnZGVmYXVsdCcsXG4gICAgYWxsb3dUZW1wbGF0ZUxpdGVyYWw6IHRydWUsXG4gICAgZW5hYmxlU2NvcGU6IGZhbHNlLFxuICB9LFxuICB7XG4gICAgbW9kdWxlTmFtZTogJ0BlbWJlci90ZW1wbGF0ZS1jb21waWxhdGlvbicsXG4gICAgZXhwb3J0OiAncHJlY29tcGlsZVRlbXBsYXRlJyxcbiAgICBhbGxvd1RlbXBsYXRlTGl0ZXJhbDogZmFsc2UsXG4gICAgZW5hYmxlU2NvcGU6IHRydWUsXG4gIH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9wdGlvbnMge1xuICAvLyBUaGUgZW1iZXItdGVtcGxhdGUtY29tcGlsZXIuanMgbW9kdWxlIHRoYXQgc2hpcHMgd2l0aGluIHlvdXIgZW1iZXItc291cmNlIHZlcnNpb24uXG4gIGNvbXBpbGVyOiBFbWJlclRlbXBsYXRlQ29tcGlsZXI7XG5cbiAgLy8gQWxsb3dzIHlvdSB0byByZW1hcCB3aGF0IGltcG9ydHMgd2lsbCBiZSBlbWl0dGVkIGluIG91ciBjb21waWxlZCBvdXRwdXQuIEJ5XG4gIC8vIGV4YW1wbGU6XG4gIC8vXG4gIC8vICAgb3V0cHV0TW9kdWxlT3ZlcnJpZGVzOiB7XG4gIC8vICAgICAnQGVtYmVyL3RlbXBsYXRlLWZhY3RvcnknOiB7XG4gIC8vICAgICAgIGNyZWF0ZVRlbXBsYXRlRmFjdG9yeTogWydjcmVhdGVUZW1wbGF0ZUZhY3RvcnknLCAnQGdsaW1tZXIvY29yZSddLFxuICAvLyAgICAgfVxuICAvLyAgIH1cbiAgLy9cbiAgLy8gTm9ybWFsIEVtYmVyIGFwcHMgc2hvdWxkbid0IG5lZWQgdGhpcywgaXQgZXhpc3RzIHRvIHN1cHBvcnQgb3RoZXJcbiAgLy8gZW52aXJvbm1lbnRzIGxpa2Ugc3RhbmRhbG9uZSBHbGltbWVySlNcbiAgb3V0cHV0TW9kdWxlT3ZlcnJpZGVzPzogUmVjb3JkPHN0cmluZywgUmVjb3JkPHN0cmluZywgW3N0cmluZywgc3RyaW5nXT4+O1xuXG4gIC8vIEJ5IGRlZmF1bHQsIHRoaXMgcGx1Z2luIGltcGxlbWVudHMgb25seSBFbWJlcidzIHN0YWJsZSBwdWJsaWMgQVBJIGZvclxuICAvLyB0ZW1wbGF0ZSBjb21waWxhdGlvbiwgd2hpY2ggaXM6XG4gIC8vXG4gIC8vICAgIGltcG9ydCB7IHByZWNvbXBpbGVUZW1wbGF0ZSB9IGZyb20gJ0BlbWJlci90ZW1wbGF0ZS1jb21waWxhdGlvbic7XG4gIC8vXG4gIC8vIEJ1dCBoaXN0b3JpY2FsbHkgdGhlcmUgYXJlIHNldmVyYWwgb3RoZXIgaW1wb3J0YWJsZSBzeW50YXhlcyBpbiB3aWRlc3ByZWFkXG4gIC8vIHVzZSwgYW5kIHdlIGNhbiBlbmFibGUgdGhvc2UgdG9vIGJ5IGluY2x1ZGluZyB0aGVpciBtb2R1bGUgbmFtZXMgaW4gdGhpc1xuICAvLyBsaXN0LlxuICBlbmFibGVMZWdhY3lNb2R1bGVzPzogTGVnYWN5TW9kdWxlTmFtZVtdO1xuXG4gIC8vIENvbnRyb2xzIHRoZSBvdXRwdXQgZm9ybWF0LlxuICAvL1xuICAvLyAgXCJ3aXJlXCI6IFRoZSBkZWZhdWx0LiBJbiB0aGUgb3V0cHV0LCB5b3VyIHRlbXBsYXRlcyBhcmUgcmVhZHkgdG8gZXhlY3V0ZSBpblxuICAvLyAgdGhlIG1vc3QgcGVyZm9ybWFudCB3YXkuXG4gIC8vXG4gIC8vICBcImhic1wiOiBJbiB0aGUgb3V0cHV0LCB5b3VyIHRlbXBsYXRlcyB3aWxsIHN0aWxsIGJlIGluIEhCUyBmb3JtYXQuXG4gIC8vICBHZW5lcmFsbHkgdGhpcyBtZWFucyB0aGV5IHdpbGwgc3RpbGwgbmVlZCBmdXJ0aGVyIHByb2Nlc3NpbmcgYmVmb3JlXG4gIC8vICB0aGV5J3JlIHJlYWR5IHRvIGV4ZWN1dGUuIFRoZSBwdXJwb3NlIG9mIHRoaXMgbW9kZSBpcyB0byBzdXBwb3J0IHRoaW5nc1xuICAvLyAgbGlrZSBjb2RlbW9kcyBhbmQgcHJlLXB1YmxpY2F0aW9uIHRyYW5zZm9ybWF0aW9ucyBpbiBsaWJyYXJpZXMuXG4gIHRhcmdldEZvcm1hdD86ICd3aXJlJyB8ICdoYnMnO1xuXG4gIC8vIE9wdGlvbmFsIGxpc3Qgb2YgY3VzdG9tIHRyYW5zZm9ybXMgdG8gYXBwbHkgdG8gdGhlIGhhbmRsZWJhcnMgQVNUIGJlZm9yZVxuICAvLyBjb21waWxhdGlvbi5cbiAgdHJhbnNmb3Jtcz86IEV4dGVuZGVkUGx1Z2luQnVpbGRlcltdO1xufVxuXG5pbnRlcmZhY2UgU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPiB7XG4gIG9wdHM6IEVudlNwZWNpZmljT3B0aW9ucztcbiAgbm9ybWFsaXplZE9wdHM6IFJlcXVpcmVkPE9wdGlvbnM+O1xuICB1dGlsOiBJbXBvcnRVdGlsO1xuICB0ZW1wbGF0ZUZhY3Rvcnk6IHsgbW9kdWxlTmFtZTogc3RyaW5nOyBleHBvcnROYW1lOiBzdHJpbmcgfTtcbiAgcHJvZ3JhbTogTm9kZVBhdGg8dC5Qcm9ncmFtPjtcbiAgbGFzdEluc2VydGVkUGF0aDogTm9kZVBhdGg8dC5TdGF0ZW1lbnQ+IHwgdW5kZWZpbmVkO1xuICBmaWxlbmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFrZVBsdWdpbjxFbnZTcGVjaWZpY09wdGlvbnM+KGxvYWRPcHRpb25zOiAob3B0czogRW52U3BlY2lmaWNPcHRpb25zKSA9PiBPcHRpb25zKSB7XG4gIHJldHVybiBmdW5jdGlvbiBodG1sYmFyc0lubGluZVByZWNvbXBpbGUoXG4gICAgYmFiZWw6IHR5cGVvZiBCYWJlbFxuICApOiBCYWJlbC5QbHVnaW5PYmo8U3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPj4ge1xuICAgIGxldCB0ID0gYmFiZWwudHlwZXM7XG5cbiAgICByZXR1cm4ge1xuICAgICAgdmlzaXRvcjoge1xuICAgICAgICBQcm9ncmFtOiB7XG4gICAgICAgICAgZW50ZXIocGF0aDogTm9kZVBhdGg8dC5Qcm9ncmFtPiwgc3RhdGU6IFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4pIHtcbiAgICAgICAgICAgIHN0YXRlLm5vcm1hbGl6ZWRPcHRzID0ge1xuICAgICAgICAgICAgICB0YXJnZXRGb3JtYXQ6ICd3aXJlJyxcbiAgICAgICAgICAgICAgb3V0cHV0TW9kdWxlT3ZlcnJpZGVzOiB7fSxcbiAgICAgICAgICAgICAgZW5hYmxlTGVnYWN5TW9kdWxlczogW10sXG4gICAgICAgICAgICAgIHRyYW5zZm9ybXM6IFtdLFxuICAgICAgICAgICAgICAuLi5sb2FkT3B0aW9ucyhzdGF0ZS5vcHRzKSxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIHN0YXRlLnRlbXBsYXRlRmFjdG9yeSA9IHRlbXBsYXRlRmFjdG9yeUNvbmZpZyhzdGF0ZS5ub3JtYWxpemVkT3B0cyk7XG4gICAgICAgICAgICBzdGF0ZS51dGlsID0gbmV3IEltcG9ydFV0aWwodCwgcGF0aCk7XG4gICAgICAgICAgICBzdGF0ZS5wcm9ncmFtID0gcGF0aDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGV4aXQoX3BhdGg6IE5vZGVQYXRoPHQuUHJvZ3JhbT4sIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+KSB7XG4gICAgICAgICAgICBpZiAoc3RhdGUubm9ybWFsaXplZE9wdHMudGFyZ2V0Rm9ybWF0ID09PSAnd2lyZScpIHtcbiAgICAgICAgICAgICAgZm9yIChsZXQgeyBtb2R1bGVOYW1lLCBleHBvcnQ6IGV4cG9ydE5hbWUgfSBvZiBjb25maWd1cmVkTW9kdWxlcyhzdGF0ZSkpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS51dGlsLnJlbW92ZUltcG9ydChtb2R1bGVOYW1lLCBleHBvcnROYW1lKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG5cbiAgICAgICAgVGFnZ2VkVGVtcGxhdGVFeHByZXNzaW9uKFxuICAgICAgICAgIHBhdGg6IE5vZGVQYXRoPHQuVGFnZ2VkVGVtcGxhdGVFeHByZXNzaW9uPixcbiAgICAgICAgICBzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPlxuICAgICAgICApIHtcbiAgICAgICAgICBsZXQgdGFnUGF0aCA9IHBhdGguZ2V0KCd0YWcnKTtcblxuICAgICAgICAgIGlmICghdGFnUGF0aC5pc0lkZW50aWZpZXIoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBsZXQgb3B0aW9ucyA9IHJlZmVyZW5jZXNJbmxpbmVDb21waWxlcih0YWdQYXRoLCBzdGF0ZSk7XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKCFvcHRpb25zLmFsbG93VGVtcGxhdGVMaXRlcmFsKSB7XG4gICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgIGBBdHRlbXB0ZWQgdG8gdXNlIFxcYCR7dGFnUGF0aC5ub2RlLm5hbWV9XFxgIGFzIGEgdGVtcGxhdGUgdGFnLCBidXQgaXQgY2FuIG9ubHkgYmUgY2FsbGVkIGFzIGEgZnVuY3Rpb24gd2l0aCBhIHN0cmluZyBwYXNzZWQgdG8gaXQ6ICR7dGFnUGF0aC5ub2RlLm5hbWV9KCdjb250ZW50IGhlcmUnKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhdGgubm9kZS5xdWFzaS5leHByZXNzaW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93IHBhdGguYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICAgICAgJ3BsYWNlaG9sZGVycyBpbnNpZGUgYSB0YWdnZWQgdGVtcGxhdGUgc3RyaW5nIGFyZSBub3Qgc3VwcG9ydGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgdGVtcGxhdGUgPSBwYXRoLm5vZGUucXVhc2kucXVhc2lzLm1hcCgocXVhc2kpID0+IHF1YXNpLnZhbHVlLmNvb2tlZCkuam9pbignJyk7XG4gICAgICAgICAgaWYgKHN0YXRlLm5vcm1hbGl6ZWRPcHRzLnRhcmdldEZvcm1hdCA9PT0gJ3dpcmUnKSB7XG4gICAgICAgICAgICBpbnNlcnRDb21waWxlZFRlbXBsYXRlKGJhYmVsLCBzdGF0ZSwgdGVtcGxhdGUsIHBhdGgsIHt9KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0VHJhbnNmb3JtZWRUZW1wbGF0ZShiYWJlbCwgc3RhdGUsIHRlbXBsYXRlLCBwYXRoLCB7fSwgb3B0aW9ucyk7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIENhbGxFeHByZXNzaW9uKHBhdGg6IE5vZGVQYXRoPHQuQ2FsbEV4cHJlc3Npb24+LCBzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPikge1xuICAgICAgICAgIGxldCBjYWxsZWVQYXRoID0gcGF0aC5nZXQoJ2NhbGxlZScpO1xuXG4gICAgICAgICAgaWYgKCFjYWxsZWVQYXRoLmlzSWRlbnRpZmllcigpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIGxldCBvcHRpb25zID0gcmVmZXJlbmNlc0lubGluZUNvbXBpbGVyKGNhbGxlZVBhdGgsIHN0YXRlKTtcbiAgICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgW2ZpcnN0QXJnLCBzZWNvbmRBcmcsIC4uLnJlc3RBcmdzXSA9IHBhdGguZ2V0KCdhcmd1bWVudHMnKTtcblxuICAgICAgICAgIGxldCB0ZW1wbGF0ZTtcblxuICAgICAgICAgIHN3aXRjaCAoZmlyc3RBcmc/Lm5vZGUudHlwZSkge1xuICAgICAgICAgICAgY2FzZSAnU3RyaW5nTGl0ZXJhbCc6XG4gICAgICAgICAgICAgIHRlbXBsYXRlID0gZmlyc3RBcmcubm9kZS52YWx1ZTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdUZW1wbGF0ZUxpdGVyYWwnOlxuICAgICAgICAgICAgICBpZiAoZmlyc3RBcmcubm9kZS5leHByZXNzaW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgICAgICAncGxhY2Vob2xkZXJzIGluc2lkZSBhIHRlbXBsYXRlIHN0cmluZyBhcmUgbm90IHN1cHBvcnRlZCdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRlbXBsYXRlID0gZmlyc3RBcmcubm9kZS5xdWFzaXMubWFwKChxdWFzaSkgPT4gcXVhc2kudmFsdWUuY29va2VkKS5qb2luKCcnKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ1RhZ2dlZFRlbXBsYXRlRXhwcmVzc2lvbic6XG4gICAgICAgICAgICAgIHRocm93IHBhdGguYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICAgICAgICBgdGFnZ2VkIHRlbXBsYXRlIHN0cmluZ3MgaW5zaWRlICR7Y2FsbGVlUGF0aC5ub2RlLm5hbWV9IGFyZSBub3Qgc3VwcG9ydGVkYFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgICAgICAgIGAke2NhbGxlZVBhdGgubm9kZS5uYW1lfSBzaG91bGQgYmUgaW52b2tlZCB3aXRoIGF0IGxlYXN0IGEgc2luZ2xlIGFyZ3VtZW50ICh0aGUgdGVtcGxhdGUgc3RyaW5nKWBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBsZXQgdXNlclR5cGVkT3B0aW9uczogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cbiAgICAgICAgICBpZiAoIXNlY29uZEFyZykge1xuICAgICAgICAgICAgdXNlclR5cGVkT3B0aW9ucyA9IHt9O1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoIXNlY29uZEFyZy5pc09iamVjdEV4cHJlc3Npb24oKSkge1xuICAgICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgICAgYCR7Y2FsbGVlUGF0aC5ub2RlLm5hbWV9IGNhbiBvbmx5IGJlIGludm9rZWQgd2l0aCAyIGFyZ3VtZW50czogdGhlIHRlbXBsYXRlIHN0cmluZywgYW5kIGFueSBzdGF0aWMgb3B0aW9uc2BcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdXNlclR5cGVkT3B0aW9ucyA9IG5ldyBFeHByZXNzaW9uUGFyc2VyKGJhYmVsKS5wYXJzZU9iamVjdEV4cHJlc3Npb24oXG4gICAgICAgICAgICAgIGNhbGxlZVBhdGgubm9kZS5uYW1lLFxuICAgICAgICAgICAgICBzZWNvbmRBcmcsXG4gICAgICAgICAgICAgIG9wdGlvbnMuZW5hYmxlU2NvcGVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChyZXN0QXJncy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgIGAke2NhbGxlZVBhdGgubm9kZS5uYW1lfSBjYW4gb25seSBiZSBpbnZva2VkIHdpdGggMiBhcmd1bWVudHM6IHRoZSB0ZW1wbGF0ZSBzdHJpbmcsIGFuZCBhbnkgc3RhdGljIG9wdGlvbnNgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoc3RhdGUubm9ybWFsaXplZE9wdHMudGFyZ2V0Rm9ybWF0ID09PSAnd2lyZScpIHtcbiAgICAgICAgICAgIGluc2VydENvbXBpbGVkVGVtcGxhdGUoYmFiZWwsIHN0YXRlLCB0ZW1wbGF0ZSwgcGF0aCwgdXNlclR5cGVkT3B0aW9ucyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydFRyYW5zZm9ybWVkVGVtcGxhdGUoYmFiZWwsIHN0YXRlLCB0ZW1wbGF0ZSwgcGF0aCwgdXNlclR5cGVkT3B0aW9ucywgb3B0aW9ucyk7XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9O1xuICB9IGFzIChiYWJlbDogdHlwZW9mIEJhYmVsKSA9PiBCYWJlbC5QbHVnaW5PYmo8dW5rbm93bj47XG59XG5cbmZ1bmN0aW9uKiBjb25maWd1cmVkTW9kdWxlczxFbnZTcGVjaWZpY09wdGlvbnM+KHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+KSB7XG4gIGZvciAobGV0IG1vZHVsZUNvbmZpZyBvZiBJTkxJTkVfUFJFQ09NUElMRV9NT0RVTEVTKSB7XG4gICAgaWYgKFxuICAgICAgbW9kdWxlQ29uZmlnLm1vZHVsZU5hbWUgIT09ICdAZW1iZXIvdGVtcGxhdGUtY29tcGlsYXRpb24nICYmXG4gICAgICAhc3RhdGUubm9ybWFsaXplZE9wdHMuZW5hYmxlTGVnYWN5TW9kdWxlcy5pbmNsdWRlcyhtb2R1bGVDb25maWcubW9kdWxlTmFtZSlcbiAgICApIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICB5aWVsZCBtb2R1bGVDb25maWc7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVmZXJlbmNlc0lubGluZUNvbXBpbGVyPEVudlNwZWNpZmljT3B0aW9ucz4oXG4gIHBhdGg6IE5vZGVQYXRoPHQuSWRlbnRpZmllcj4sXG4gIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+XG4pOiBNb2R1bGVDb25maWcgfCB1bmRlZmluZWQge1xuICBmb3IgKGxldCBtb2R1bGVDb25maWcgb2YgY29uZmlndXJlZE1vZHVsZXMoc3RhdGUpKSB7XG4gICAgaWYgKHBhdGgucmVmZXJlbmNlc0ltcG9ydChtb2R1bGVDb25maWcubW9kdWxlTmFtZSwgbW9kdWxlQ29uZmlnLmV4cG9ydCkpIHtcbiAgICAgIHJldHVybiBtb2R1bGVDb25maWc7XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJ1bnRpbWVFcnJvcklJRkUoYmFiZWw6IHR5cGVvZiBCYWJlbCwgcmVwbGFjZW1lbnRzOiB7IEVSUk9SX01FU1NBR0U6IHN0cmluZyB9KSB7XG4gIGxldCBzdGF0ZW1lbnQgPSBiYWJlbC50ZW1wbGF0ZShgKGZ1bmN0aW9uKCkge1xcbiAgdGhyb3cgbmV3IEVycm9yKCdFUlJPUl9NRVNTQUdFJyk7XFxufSkoKTtgKShcbiAgICByZXBsYWNlbWVudHNcbiAgKSBhcyB0LkV4cHJlc3Npb25TdGF0ZW1lbnQ7XG4gIHJldHVybiBzdGF0ZW1lbnQuZXhwcmVzc2lvbjtcbn1cblxuZnVuY3Rpb24gYnVpbGRQcmVjb21waWxlT3B0aW9uczxFbnZTcGVjaWZpY09wdGlvbnM+KFxuICBiYWJlbDogdHlwZW9mIEJhYmVsLFxuICB0YXJnZXQ6IE5vZGVQYXRoPHQuRXhwcmVzc2lvbj4sXG4gIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+LFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuICB1c2VyVHlwZWRPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuKTogUHJlcHJvY2Vzc09wdGlvbnMgJiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gIGlmICghdXNlclR5cGVkT3B0aW9ucy5sb2NhbHMpIHtcbiAgICB1c2VyVHlwZWRPcHRpb25zLmxvY2FscyA9IFtdO1xuICB9XG4gIGxldCBqc3V0aWxzID0gbmV3IEpTVXRpbHMoYmFiZWwsIHN0YXRlLCB0YXJnZXQsIHVzZXJUeXBlZE9wdGlvbnMubG9jYWxzIGFzIHN0cmluZ1tdLCBzdGF0ZS51dGlsKTtcbiAgbGV0IG1ldGEgPSBPYmplY3QuYXNzaWduKHsganN1dGlscyB9LCB1c2VyVHlwZWRPcHRpb25zPy5tZXRhKTtcbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oXG4gICAge1xuICAgICAgY29udGVudHM6IHRlbXBsYXRlLFxuICAgICAgbWV0YSxcblxuICAgICAgLy8gVE9ETzogZW1icm9pZGVyJ3MgdGVtcGxhdGUtY29tcGlsZXIgYWxsb3dzIHRoaXMgdG8gYmUgb3ZlcnJpZGVuIHRvIGdldFxuICAgICAgLy8gYmFja3dhcmQtY29tcGF0aWJsZSBtb2R1bGUgbmFtZXMgdGhhdCBkb24ndCBtYXRjaCB0aGUgcmVhbCBuYW1lIG9mIHRoZVxuICAgICAgLy8gb24tZGlzayBmaWxlLiBXaGF0J3Mgb3VyIHBsYW4gZm9yIG1pZ3JhdGluZyBwZW9wbGUgYXdheSBmcm9tIHRoYXQ/XG4gICAgICBtb2R1bGVOYW1lOiBzdGF0ZS5maWxlbmFtZSxcblxuICAgICAgLy8gVGhpcyBpcyBoZXJlIHNvIGl0J3MgKmFsd2F5cyogdGhlIHJlYWwgZmlsZW5hbWUuIEhpc3RvcmljYWxseSwgdGhlcmUgaXNcbiAgICAgIC8vIGFsc28gYG1vZHVsZU5hbWVgIGJ1dCB0aGF0IGRpZCBub3QgbWF0Y2ggdGhlIHJlYWwgb24tZGlzayBmaWxlbmFtZSwgaXRcbiAgICAgIC8vIHdhcyB0aGUgbm90aW9uYWwgcnVudGltZSBtb2R1bGUgbmFtZSBmcm9tIGNsYXNzaWMgZW1iZXIgYnVpbGRzLlxuICAgICAgZmlsZW5hbWU6IHN0YXRlLmZpbGVuYW1lLFxuXG4gICAgICBwbHVnaW5zOiB7XG4gICAgICAgIGFzdDogc3RhdGUubm9ybWFsaXplZE9wdHMudHJhbnNmb3JtcyxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB1c2VyVHlwZWRPcHRpb25zXG4gICk7XG59XG5cbmZ1bmN0aW9uIGluc2VydENvbXBpbGVkVGVtcGxhdGU8RW52U3BlY2lmaWNPcHRpb25zPihcbiAgYmFiZWw6IHR5cGVvZiBCYWJlbCxcbiAgc3RhdGU6IFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4sXG4gIHRlbXBsYXRlOiBzdHJpbmcsXG4gIHRhcmdldDogTm9kZVBhdGg8dC5FeHByZXNzaW9uPixcbiAgdXNlclR5cGVkT3B0aW9uczogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbikge1xuICBsZXQgdCA9IGJhYmVsLnR5cGVzO1xuICBsZXQgb3B0aW9ucyA9IGJ1aWxkUHJlY29tcGlsZU9wdGlvbnMoYmFiZWwsIHRhcmdldCwgc3RhdGUsIHRlbXBsYXRlLCB1c2VyVHlwZWRPcHRpb25zKTtcblxuICBsZXQgcHJlY29tcGlsZVJlc3VsdFN0cmluZzogc3RyaW5nO1xuXG4gIGlmIChvcHRpb25zLmluc2VydFJ1bnRpbWVFcnJvcnMpIHtcbiAgICB0cnkge1xuICAgICAgcHJlY29tcGlsZVJlc3VsdFN0cmluZyA9IHN0YXRlLm5vcm1hbGl6ZWRPcHRzLmNvbXBpbGVyLnByZWNvbXBpbGUodGVtcGxhdGUsIG9wdGlvbnMpO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICB0YXJnZXQucmVwbGFjZVdpdGgocnVudGltZUVycm9ySUlGRShiYWJlbCwgeyBFUlJPUl9NRVNTQUdFOiAoZXJyb3IgYXMgYW55KS5tZXNzYWdlIH0pKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgcHJlY29tcGlsZVJlc3VsdFN0cmluZyA9IHN0YXRlLm5vcm1hbGl6ZWRPcHRzLmNvbXBpbGVyLnByZWNvbXBpbGUodGVtcGxhdGUsIG9wdGlvbnMpO1xuICB9XG5cbiAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKG9wdGlvbnMubG9jYWxzV2l0aE5hbWVzID8/IHt9KS5qb2luKCcsJyk7XG4gIGNvbnN0IHZhbHVlcyA9IE9iamVjdC52YWx1ZXMob3B0aW9ucy5sb2NhbHNXaXRoTmFtZXMgPz8ge30pLmpvaW4oJywnKTtcblxuICBsZXQgcHJlY29tcGlsZVJlc3VsdEFTVCA9IGJhYmVsLnBhcnNlKFxuICAgIGB2YXIgcHJlY29tcGlsZVJlc3VsdCA9ICgoJHtrZXlzfSk9Pigke3ByZWNvbXBpbGVSZXN1bHRTdHJpbmd9KSkoJHt2YWx1ZXN9KTsgYCxcbiAgICB7XG4gICAgICBiYWJlbHJjOiBmYWxzZSxcbiAgICAgIGNvbmZpZ0ZpbGU6IGZhbHNlLFxuICAgIH1cbiAgKSBhcyB0LkZpbGU7XG5cbiAgbGV0IHRlbXBsYXRlRXhwcmVzc2lvbiA9IChwcmVjb21waWxlUmVzdWx0QVNULnByb2dyYW0uYm9keVswXSBhcyB0LlZhcmlhYmxlRGVjbGFyYXRpb24pXG4gICAgLmRlY2xhcmF0aW9uc1swXS5pbml0IGFzIHQuQ2FsbEV4cHJlc3Npb247XG5cbiAgdC5hZGRDb21tZW50KFxuICAgIHRlbXBsYXRlRXhwcmVzc2lvbixcbiAgICAnbGVhZGluZycsXG4gICAgYFxcbiAgJHt0ZW1wbGF0ZS5yZXBsYWNlKC9cXCpcXC8vZywgJypcXFxcLycpfVxcbmAsXG4gICAgLyogbGluZSBjb21tZW50PyAqLyBmYWxzZVxuICApO1xuXG4gIGxldCB0ZW1wbGF0ZUZhY3RvcnlJZGVudGlmaWVyID0gc3RhdGUudXRpbC5pbXBvcnQoXG4gICAgdGFyZ2V0LFxuICAgIHN0YXRlLnRlbXBsYXRlRmFjdG9yeS5tb2R1bGVOYW1lLFxuICAgIHN0YXRlLnRlbXBsYXRlRmFjdG9yeS5leHBvcnROYW1lXG4gICk7XG4gIHRhcmdldC5yZXBsYWNlV2l0aCh0LmNhbGxFeHByZXNzaW9uKHRlbXBsYXRlRmFjdG9yeUlkZW50aWZpZXIsIFt0ZW1wbGF0ZUV4cHJlc3Npb25dKSk7XG59XG5cbmZ1bmN0aW9uIGluc2VydFRyYW5zZm9ybWVkVGVtcGxhdGU8RW52U3BlY2lmaWNPcHRpb25zPihcbiAgYmFiZWw6IHR5cGVvZiBCYWJlbCxcbiAgc3RhdGU6IFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4sXG4gIHRlbXBsYXRlOiBzdHJpbmcsXG4gIHRhcmdldDogTm9kZVBhdGg8dC5DYWxsRXhwcmVzc2lvbj4gfCBOb2RlUGF0aDx0LlRhZ2dlZFRlbXBsYXRlRXhwcmVzc2lvbj4sXG4gIHVzZXJUeXBlZE9wdGlvbnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuICBmb3JtYXRPcHRpb25zOiBNb2R1bGVDb25maWdcbikge1xuICBsZXQgdCA9IGJhYmVsLnR5cGVzO1xuICBsZXQgb3B0aW9ucyA9IGJ1aWxkUHJlY29tcGlsZU9wdGlvbnMoYmFiZWwsIHRhcmdldCwgc3RhdGUsIHRlbXBsYXRlLCB1c2VyVHlwZWRPcHRpb25zKTtcbiAgbGV0IGFzdCA9IHN0YXRlLm5vcm1hbGl6ZWRPcHRzLmNvbXBpbGVyLl9wcmVwcm9jZXNzKHRlbXBsYXRlLCB7IC4uLm9wdGlvbnMsIG1vZGU6ICdjb2RlbW9kJyB9KTtcbiAgbGV0IHRyYW5zZm9ybWVkID0gc3RhdGUubm9ybWFsaXplZE9wdHMuY29tcGlsZXIuX3ByaW50KGFzdCk7XG4gIGlmICh0YXJnZXQuaXNDYWxsRXhwcmVzc2lvbigpKSB7XG4gICAgKHRhcmdldC5nZXQoJ2FyZ3VtZW50cy4wJykgYXMgTm9kZVBhdGg8dC5Ob2RlPikucmVwbGFjZVdpdGgodC5zdHJpbmdMaXRlcmFsKHRyYW5zZm9ybWVkKSk7XG4gICAgaWYgKG9wdGlvbnMubG9jYWxzICYmIG9wdGlvbnMubG9jYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghZm9ybWF0T3B0aW9ucy5lbmFibGVTY29wZSkge1xuICAgICAgICBtYXliZVBydW5lSW1wb3J0KHN0YXRlLnV0aWwsIHRhcmdldC5nZXQoJ2NhbGxlZScpKTtcbiAgICAgICAgdGFyZ2V0LnNldCgnY2FsbGVlJywgcHJlY29tcGlsZVRlbXBsYXRlKHN0YXRlLnV0aWwsIHRhcmdldCkpO1xuICAgICAgfVxuICAgICAgdXBkYXRlU2NvcGUoYmFiZWwsIHRhcmdldCwgb3B0aW9ucy5sb2NhbHMpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAob3B0aW9ucy5sb2NhbHMgJiYgb3B0aW9ucy5sb2NhbHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gbmVlZCB0byBhZGQgc2NvcGUsIHNvIG5lZWQgdG8gcmVwbGFjZSB0aGUgYmFja3RpY2tzIGZvcm0gd2l0aCBhIGNhbGxcbiAgICAgIC8vIGV4cHJlc3Npb24gdG8gcHJlY29tcGlsZVRlbXBsYXRlXG4gICAgICBtYXliZVBydW5lSW1wb3J0KHN0YXRlLnV0aWwsIHRhcmdldC5nZXQoJ3RhZycpKTtcbiAgICAgIGxldCBuZXdDYWxsID0gdGFyZ2V0LnJlcGxhY2VXaXRoKFxuICAgICAgICB0LmNhbGxFeHByZXNzaW9uKHByZWNvbXBpbGVUZW1wbGF0ZShzdGF0ZS51dGlsLCB0YXJnZXQpLCBbdC5zdHJpbmdMaXRlcmFsKHRyYW5zZm9ybWVkKV0pXG4gICAgICApWzBdO1xuICAgICAgdXBkYXRlU2NvcGUoYmFiZWwsIG5ld0NhbGwsIG9wdGlvbnMubG9jYWxzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgKHRhcmdldC5nZXQoJ3F1YXNpJykuZ2V0KCdxdWFzaXMuMCcpIGFzIE5vZGVQYXRoPHQuVGVtcGxhdGVFbGVtZW50PikucmVwbGFjZVdpdGgoXG4gICAgICAgIHQudGVtcGxhdGVFbGVtZW50KHsgcmF3OiB0cmFuc2Zvcm1lZCB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdGVtcGxhdGVGYWN0b3J5Q29uZmlnKG9wdHM6IFJlcXVpcmVkPE9wdGlvbnM+KSB7XG4gIGxldCBtb2R1bGVOYW1lID0gJ0BlbWJlci90ZW1wbGF0ZS1mYWN0b3J5JztcbiAgbGV0IGV4cG9ydE5hbWUgPSAnY3JlYXRlVGVtcGxhdGVGYWN0b3J5JztcbiAgbGV0IG92ZXJyaWRlcyA9IG9wdHMub3V0cHV0TW9kdWxlT3ZlcnJpZGVzW21vZHVsZU5hbWVdPy5bZXhwb3J0TmFtZV07XG4gIHJldHVybiBvdmVycmlkZXNcbiAgICA/IHsgZXhwb3J0TmFtZTogb3ZlcnJpZGVzWzBdLCBtb2R1bGVOYW1lOiBvdmVycmlkZXNbMV0gfVxuICAgIDogeyBleHBvcnROYW1lLCBtb2R1bGVOYW1lIH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU2NvcGUoYmFiZWw6IHR5cGVvZiBCYWJlbCwgbG9jYWxzOiBzdHJpbmdbXSkge1xuICBsZXQgdCA9IGJhYmVsLnR5cGVzO1xuICByZXR1cm4gdC5hcnJvd0Z1bmN0aW9uRXhwcmVzc2lvbihcbiAgICBbXSxcbiAgICB0Lm9iamVjdEV4cHJlc3Npb24oXG4gICAgICBsb2NhbHMubWFwKChuYW1lKSA9PiB0Lm9iamVjdFByb3BlcnR5KHQuaWRlbnRpZmllcihuYW1lKSwgdC5pZGVudGlmaWVyKG5hbWUpLCBmYWxzZSwgdHJ1ZSkpXG4gICAgKVxuICApO1xufVxuZnVuY3Rpb24gdXBkYXRlU2NvcGUoYmFiZWw6IHR5cGVvZiBCYWJlbCwgdGFyZ2V0OiBOb2RlUGF0aDx0LkNhbGxFeHByZXNzaW9uPiwgbG9jYWxzOiBzdHJpbmdbXSkge1xuICBsZXQgdCA9IGJhYmVsLnR5cGVzO1xuICBsZXQgc2Vjb25kQXJnID0gdGFyZ2V0LmdldCgnYXJndW1lbnRzLjEnKSBhcyBOb2RlUGF0aDx0Lk9iamVjdEV4cHJlc3Npb24+IHwgdW5kZWZpbmVkO1xuICBpZiAoc2Vjb25kQXJnKSB7XG4gICAgbGV0IHNjb3BlID0gc2Vjb25kQXJnLmdldCgncHJvcGVydGllcycpLmZpbmQoKHApID0+IHtcbiAgICAgIGxldCBrZXkgPSBwLmdldCgna2V5JykgYXMgTm9kZVBhdGg8dC5Ob2RlPjtcbiAgICAgIHJldHVybiBrZXkuaXNJZGVudGlmaWVyKCkgJiYga2V5Lm5vZGUubmFtZSA9PT0gJ3Njb3BlJztcbiAgICB9KTtcbiAgICBpZiAoc2NvcGUpIHtcbiAgICAgIHNjb3BlLnNldCgndmFsdWUnLCBidWlsZFNjb3BlKGJhYmVsLCBsb2NhbHMpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2Vjb25kQXJnLnB1c2hDb250YWluZXIoXG4gICAgICAgICdwcm9wZXJ0aWVzJyxcbiAgICAgICAgdC5vYmplY3RQcm9wZXJ0eSh0LmlkZW50aWZpZXIoJ3Njb3BlJyksIGJ1aWxkU2NvcGUoYmFiZWwsIGxvY2FscykpXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQucHVzaENvbnRhaW5lcihcbiAgICAgICdhcmd1bWVudHMnLFxuICAgICAgdC5vYmplY3RFeHByZXNzaW9uKFt0Lm9iamVjdFByb3BlcnR5KHQuaWRlbnRpZmllcignc2NvcGUnKSwgYnVpbGRTY29wZShiYWJlbCwgbG9jYWxzKSldKVxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWF5YmVQcnVuZUltcG9ydChcbiAgdXRpbDogSW1wb3J0VXRpbCxcbiAgaWRlbnRpZmllcjogTm9kZVBhdGg8dC5FeHByZXNzaW9uIHwgdC5WOEludHJpbnNpY0lkZW50aWZpZXI+XG4pIHtcbiAgaWYgKCFpZGVudGlmaWVyLmlzSWRlbnRpZmllcigpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCBiaW5kaW5nID0gaWRlbnRpZmllci5zY29wZS5nZXRCaW5kaW5nKGlkZW50aWZpZXIubm9kZS5uYW1lKTtcbiAgLy8gdGhpcyBjaGVja3MgaWYgdGhlIGlkZW50aWZpZXIgKHRoYXQgd2UncmUgYWJvdXQgdG8gcmVtb3ZlKSBpcyB1c2VkIGluXG4gIC8vIGV4YWN0bHkgb25lIHBsYWNlLlxuICBpZiAoXG4gICAgYmluZGluZz8ucmVmZXJlbmNlUGF0aHMucmVkdWNlKChjb3VudCwgcGF0aCkgPT4gKHBhdGgucmVtb3ZlZCA/IGNvdW50IDogY291bnQgKyAxKSwgMCkgPT09IDFcbiAgKSB7XG4gICAgbGV0IHNwZWNpZmllciA9IGJpbmRpbmcucGF0aDtcbiAgICBpZiAoc3BlY2lmaWVyLmlzSW1wb3J0U3BlY2lmaWVyKCkpIHtcbiAgICAgIGxldCBkZWNsYXJhdGlvbiA9IHNwZWNpZmllci5wYXJlbnRQYXRoIGFzIE5vZGVQYXRoPHQuSW1wb3J0RGVjbGFyYXRpb24+O1xuICAgICAgdXRpbC5yZW1vdmVJbXBvcnQoZGVjbGFyYXRpb24ubm9kZS5zb3VyY2UudmFsdWUsIG5hbWUoc3BlY2lmaWVyLm5vZGUuaW1wb3J0ZWQpKTtcbiAgICB9XG4gIH1cbiAgaWRlbnRpZmllci5yZW1vdmVkID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gcHJlY29tcGlsZVRlbXBsYXRlKHV0aWw6IEltcG9ydFV0aWwsIHRhcmdldDogTm9kZVBhdGg8dC5Ob2RlPikge1xuICByZXR1cm4gdXRpbC5pbXBvcnQodGFyZ2V0LCAnQGVtYmVyL3RlbXBsYXRlLWNvbXBpbGF0aW9uJywgJ3ByZWNvbXBpbGVUZW1wbGF0ZScpO1xufVxuXG5mdW5jdGlvbiBuYW1lKG5vZGU6IHQuU3RyaW5nTGl0ZXJhbCB8IHQuSWRlbnRpZmllcikge1xuICBpZiAobm9kZS50eXBlID09PSAnU3RyaW5nTGl0ZXJhbCcpIHtcbiAgICByZXR1cm4gbm9kZS52YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbm9kZS5uYW1lO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IG1ha2VQbHVnaW48T3B0aW9ucz4oKG9wdGlvbnMpID0+IG9wdGlvbnMpO1xuIl19