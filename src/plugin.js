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
    let precompileResultAST = babel.parse(`var precompileResult = ${precompileResultString};`, {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGx1Z2luLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBR0EseURBQStDO0FBQy9DLDJEQUF1RDtBQUN2RCx5Q0FBNEQ7QUFJNUQsaURBQStCO0FBVy9CLE1BQU0seUJBQXlCLEdBQW1CO0lBQ2hEO1FBQ0UsVUFBVSxFQUFFLG9CQUFvQjtRQUNoQyxNQUFNLEVBQUUsS0FBSztRQUNiLG9CQUFvQixFQUFFLElBQUk7UUFDMUIsV0FBVyxFQUFFLEtBQUs7S0FDbkI7SUFDRDtRQUNFLFVBQVUsRUFBRSxzQ0FBc0M7UUFDbEQsTUFBTSxFQUFFLFNBQVM7UUFDakIsb0JBQW9CLEVBQUUsSUFBSTtRQUMxQixXQUFXLEVBQUUsS0FBSztLQUNuQjtJQUNEO1FBQ0UsVUFBVSxFQUFFLDRCQUE0QjtRQUN4QyxNQUFNLEVBQUUsU0FBUztRQUNqQixvQkFBb0IsRUFBRSxJQUFJO1FBQzFCLFdBQVcsRUFBRSxLQUFLO0tBQ25CO0lBQ0Q7UUFDRSxVQUFVLEVBQUUsNkJBQTZCO1FBQ3pDLE1BQU0sRUFBRSxvQkFBb0I7UUFDNUIsb0JBQW9CLEVBQUUsS0FBSztRQUMzQixXQUFXLEVBQUUsSUFBSTtLQUNsQjtDQUNGLENBQUM7QUF1REYsU0FBZ0IsVUFBVSxDQUFxQixXQUFrRDtJQUMvRixPQUFPLFNBQVMsd0JBQXdCLENBQ3RDLEtBQW1CO1FBRW5CLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFcEIsT0FBTztZQUNMLE9BQU8sRUFBRTtnQkFDUCxPQUFPLEVBQUU7b0JBQ1AsS0FBSyxDQUFDLElBQXlCLEVBQUUsS0FBZ0M7d0JBQy9ELEtBQUssQ0FBQyxjQUFjLG1CQUNsQixZQUFZLEVBQUUsTUFBTSxFQUNwQixxQkFBcUIsRUFBRSxFQUFFLEVBQ3pCLG1CQUFtQixFQUFFLEVBQUUsRUFDdkIsVUFBVSxFQUFFLEVBQUUsSUFDWCxXQUFXLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUMzQixDQUFDO3dCQUVGLEtBQUssQ0FBQyxlQUFlLEdBQUcscUJBQXFCLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO3dCQUNwRSxLQUFLLENBQUMsSUFBSSxHQUFHLElBQUksOEJBQVUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7d0JBQ3JDLEtBQUssQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO29CQUN2QixDQUFDO29CQUNELElBQUksQ0FBQyxLQUEwQixFQUFFLEtBQWdDO3dCQUMvRCxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRTs0QkFDaEQsS0FBSyxJQUFJLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsSUFBSSxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQ0FDdkUsS0FBSyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQyxDQUFDOzZCQUNqRDt5QkFDRjtvQkFDSCxDQUFDO2lCQUNGO2dCQUVELHdCQUF3QixDQUN0QixJQUEwQyxFQUMxQyxLQUFnQztvQkFFaEMsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztvQkFFOUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsRUFBRTt3QkFDM0IsT0FBTztxQkFDUjtvQkFDRCxJQUFJLE9BQU8sR0FBRyx3QkFBd0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUM7b0JBQ3ZELElBQUksQ0FBQyxPQUFPLEVBQUU7d0JBQ1osT0FBTztxQkFDUjtvQkFFRCxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixFQUFFO3dCQUNqQyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FDNUIsc0JBQXNCLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSw2RkFBNkYsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLGtCQUFrQixDQUN4SyxDQUFDO3FCQUNIO29CQUVELElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRTt3QkFDdEMsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQzVCLGdFQUFnRSxDQUNqRSxDQUFDO3FCQUNIO29CQUVELElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUNsRixJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRTt3QkFDaEQsc0JBQXNCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO3FCQUMxRDt5QkFBTTt3QkFDTCx5QkFBeUIsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE9BQU8sQ0FBQyxDQUFDO3FCQUN0RTtnQkFDSCxDQUFDO2dCQUVELGNBQWMsQ0FBQyxJQUFnQyxFQUFFLEtBQWdDO29CQUMvRSxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO29CQUVwQyxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksRUFBRSxFQUFFO3dCQUM5QixPQUFPO3FCQUNSO29CQUNELElBQUksT0FBTyxHQUFHLHdCQUF3QixDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDMUQsSUFBSSxDQUFDLE9BQU8sRUFBRTt3QkFDWixPQUFPO3FCQUNSO29CQUVELElBQUksQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLEdBQUcsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsQ0FBQztvQkFFL0QsSUFBSSxRQUFRLENBQUM7b0JBRWIsUUFBUSxRQUFRLGFBQVIsUUFBUSx1QkFBUixRQUFRLENBQUUsSUFBSSxDQUFDLElBQUksRUFBRTt3QkFDM0IsS0FBSyxlQUFlOzRCQUNsQixRQUFRLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7NEJBQy9CLE1BQU07d0JBQ1IsS0FBSyxpQkFBaUI7NEJBQ3BCLElBQUksUUFBUSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFO2dDQUNwQyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FDNUIseURBQXlELENBQzFELENBQUM7NkJBQ0g7aUNBQU07Z0NBQ0wsUUFBUSxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7NkJBQzdFOzRCQUNELE1BQU07d0JBQ1IsS0FBSywwQkFBMEI7NEJBQzdCLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUM1QixrQ0FBa0MsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLG9CQUFvQixDQUMzRSxDQUFDO3dCQUNKOzRCQUNFLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUM1QixHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSwwRUFBMEUsQ0FDbEcsQ0FBQztxQkFDTDtvQkFFRCxJQUFJLGdCQUF5QyxDQUFDO29CQUU5QyxJQUFJLENBQUMsU0FBUyxFQUFFO3dCQUNkLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztxQkFDdkI7eUJBQU07d0JBQ0wsSUFBSSxDQUFDLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFOzRCQUNuQyxNQUFNLElBQUksQ0FBQyxtQkFBbUIsQ0FDNUIsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksb0ZBQW9GLENBQzVHLENBQUM7eUJBQ0g7d0JBRUQsZ0JBQWdCLEdBQUcsSUFBSSxvQ0FBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxxQkFBcUIsQ0FDbEUsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQ3BCLFNBQVMsRUFDVCxPQUFPLENBQUMsV0FBVyxDQUNwQixDQUFDO3FCQUNIO29CQUNELElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7d0JBQ3ZCLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUM1QixHQUFHLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxvRkFBb0YsQ0FDNUcsQ0FBQztxQkFDSDtvQkFDRCxJQUFJLEtBQUssQ0FBQyxjQUFjLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRTt3QkFDaEQsc0JBQXNCLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7cUJBQ3hFO3lCQUFNO3dCQUNMLHlCQUF5QixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxPQUFPLENBQUMsQ0FBQztxQkFDcEY7Z0JBQ0gsQ0FBQzthQUNGO1NBQ0YsQ0FBQztJQUNKLENBQXNELENBQUM7QUFDekQsQ0FBQztBQXRJRCxnQ0FzSUM7QUFFRCxRQUFRLENBQUMsQ0FBQyxpQkFBaUIsQ0FBcUIsS0FBZ0M7SUFDOUUsS0FBSyxJQUFJLFlBQVksSUFBSSx5QkFBeUIsRUFBRTtRQUNsRCxJQUNFLFlBQVksQ0FBQyxVQUFVLEtBQUssNkJBQTZCO1lBQ3pELENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQyxFQUMzRTtZQUNBLFNBQVM7U0FDVjtRQUNELE1BQU0sWUFBWSxDQUFDO0tBQ3BCO0FBQ0gsQ0FBQztBQUVELFNBQVMsd0JBQXdCLENBQy9CLElBQTRCLEVBQzVCLEtBQWdDO0lBRWhDLEtBQUssSUFBSSxZQUFZLElBQUksaUJBQWlCLENBQUMsS0FBSyxDQUFDLEVBQUU7UUFDakQsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsWUFBWSxDQUFDLFVBQVUsRUFBRSxZQUFZLENBQUMsTUFBTSxDQUFDLEVBQUU7WUFDdkUsT0FBTyxZQUFZLENBQUM7U0FDckI7S0FDRjtJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ25CLENBQUM7QUFFRCxTQUFTLGdCQUFnQixDQUFDLEtBQW1CLEVBQUUsWUFBdUM7SUFDcEYsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDLFFBQVEsQ0FBQywyREFBMkQsQ0FBQyxDQUN6RixZQUFZLENBQ1ksQ0FBQztJQUMzQixPQUFPLFNBQVMsQ0FBQyxVQUFVLENBQUM7QUFDOUIsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQzdCLEtBQW1CLEVBQ25CLE1BQThCLEVBQzlCLEtBQWdDLEVBQ2hDLFFBQWdCLEVBQ2hCLGdCQUF5QztJQUV6QyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxFQUFFO1FBQzVCLGdCQUFnQixDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUM7S0FDOUI7SUFDRCxJQUFJLE9BQU8sR0FBRyxJQUFJLGtCQUFPLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsTUFBa0IsRUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDakcsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sRUFBRSxFQUFFLGdCQUFnQixhQUFoQixnQkFBZ0IsdUJBQWhCLGdCQUFnQixDQUFFLElBQUksQ0FBQyxDQUFDO0lBQzlELE9BQU8sTUFBTSxDQUFDLE1BQU0sQ0FDbEI7UUFDRSxRQUFRLEVBQUUsUUFBUTtRQUNsQixJQUFJO1FBRUoseUVBQXlFO1FBQ3pFLHlFQUF5RTtRQUN6RSxxRUFBcUU7UUFDckUsVUFBVSxFQUFFLEtBQUssQ0FBQyxRQUFRO1FBRTFCLDBFQUEwRTtRQUMxRSx5RUFBeUU7UUFDekUsa0VBQWtFO1FBQ2xFLFFBQVEsRUFBRSxLQUFLLENBQUMsUUFBUTtRQUV4QixPQUFPLEVBQUU7WUFDUCxHQUFHLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFVO1NBQ3JDO0tBQ0YsRUFDRCxnQkFBZ0IsQ0FDakIsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUM3QixLQUFtQixFQUNuQixLQUFnQyxFQUNoQyxRQUFnQixFQUNoQixNQUE4QixFQUM5QixnQkFBeUM7SUFFekMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUNwQixJQUFJLE9BQU8sR0FBRyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUV2RixJQUFJLHNCQUE4QixDQUFDO0lBRW5DLElBQUksT0FBTyxDQUFDLG1CQUFtQixFQUFFO1FBQy9CLElBQUk7WUFDRixzQkFBc0IsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1NBQ3RGO1FBQUMsT0FBTyxLQUFLLEVBQUU7WUFDZCxNQUFNLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLEtBQUssRUFBRSxFQUFFLGFBQWEsRUFBRyxLQUFhLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLE9BQU87U0FDUjtLQUNGO1NBQU07UUFDTCxzQkFBc0IsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQ3RGO0lBRUQsSUFBSSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLDBCQUEwQixzQkFBc0IsR0FBRyxFQUFFO1FBQ3pGLE9BQU8sRUFBRSxLQUFLO1FBQ2QsVUFBVSxFQUFFLEtBQUs7S0FDbEIsQ0FBVyxDQUFDO0lBRWIsSUFBSSxrQkFBa0IsR0FBSSxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBMkI7U0FDcEYsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQW9CLENBQUM7SUFFeEMsQ0FBQyxDQUFDLFVBQVUsQ0FDVixrQkFBa0IsRUFDbEIsU0FBUyxFQUNULE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLElBQUk7SUFDNUMsbUJBQW1CLENBQUMsS0FBSyxDQUMxQixDQUFDO0lBRUYsSUFBSSx5QkFBeUIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FDL0MsTUFBTSxFQUNOLEtBQUssQ0FBQyxlQUFlLENBQUMsVUFBVSxFQUNoQyxLQUFLLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FDakMsQ0FBQztJQUNGLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyx5QkFBeUIsRUFBRSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hGLENBQUM7QUFFRCxTQUFTLHlCQUF5QixDQUNoQyxLQUFtQixFQUNuQixLQUFnQyxFQUNoQyxRQUFnQixFQUNoQixNQUF5RSxFQUN6RSxnQkFBeUMsRUFDekMsYUFBMkI7SUFFM0IsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUNwQixJQUFJLE9BQU8sR0FBRyxzQkFBc0IsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztJQUN2RixJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxrQ0FBTyxPQUFPLEtBQUUsSUFBSSxFQUFFLFNBQVMsSUFBRyxDQUFDO0lBQy9GLElBQUksV0FBVyxHQUFHLEtBQUssQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1RCxJQUFJLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxFQUFFO1FBQzVCLE1BQU0sQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFzQixDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFDMUYsSUFBSSxPQUFPLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUMvQyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsRUFBRTtnQkFDOUIsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ25ELE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQzthQUM5RDtZQUNELFdBQVcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztTQUM1QztLQUNGO1NBQU07UUFDTCxJQUFJLE9BQU8sQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQy9DLHVFQUF1RTtZQUN2RSxtQ0FBbUM7WUFDbkMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDaEQsSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FDOUIsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQ3pGLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDTCxXQUFXLENBQUMsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDN0M7YUFBTTtZQUNKLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBaUMsQ0FBQyxXQUFXLENBQzlFLENBQUMsQ0FBQyxlQUFlLENBQUMsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FDeEMsQ0FBQztTQUNIO0tBQ0Y7QUFDSCxDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUF1Qjs7SUFDcEQsSUFBSSxVQUFVLEdBQUcseUJBQXlCLENBQUM7SUFDM0MsSUFBSSxVQUFVLEdBQUcsdUJBQXVCLENBQUM7SUFDekMsSUFBSSxTQUFTLEdBQUcsTUFBQSxJQUFJLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLDBDQUFHLFVBQVUsQ0FBQyxDQUFDO0lBQ3JFLE9BQU8sU0FBUztRQUNkLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsVUFBVSxFQUFFLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUN4RCxDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsVUFBVSxFQUFFLENBQUM7QUFDakMsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLEtBQW1CLEVBQUUsTUFBZ0I7SUFDdkQsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUNwQixPQUFPLENBQUMsQ0FBQyx1QkFBdUIsQ0FDOUIsRUFBRSxFQUNGLENBQUMsQ0FBQyxnQkFBZ0IsQ0FDaEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQzVGLENBQ0YsQ0FBQztBQUNKLENBQUM7QUFDRCxTQUFTLFdBQVcsQ0FBQyxLQUFtQixFQUFFLE1BQWtDLEVBQUUsTUFBZ0I7SUFDNUYsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUNwQixJQUFJLFNBQVMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBNkMsQ0FBQztJQUN0RixJQUFJLFNBQVMsRUFBRTtRQUNiLElBQUksS0FBSyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDakQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQXFCLENBQUM7WUFDM0MsT0FBTyxHQUFHLENBQUMsWUFBWSxFQUFFLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssT0FBTyxDQUFDO1FBQ3pELENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxLQUFLLEVBQUU7WUFDVCxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sRUFBRSxVQUFVLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7U0FDL0M7YUFBTTtZQUNMLFNBQVMsQ0FBQyxhQUFhLENBQ3JCLFlBQVksRUFDWixDQUFDLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsVUFBVSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUNuRSxDQUFDO1NBQ0g7S0FDRjtTQUFNO1FBQ0wsTUFBTSxDQUFDLGFBQWEsQ0FDbEIsV0FBVyxFQUNYLENBQUMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsRUFBRSxVQUFVLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUN6RixDQUFDO0tBQ0g7QUFDSCxDQUFDO0FBRUQsU0FBUyxnQkFBZ0IsQ0FDdkIsSUFBZ0IsRUFDaEIsVUFBNEQ7SUFFNUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxZQUFZLEVBQUUsRUFBRTtRQUM5QixPQUFPO0tBQ1I7SUFDRCxJQUFJLE9BQU8sR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2hFLHdFQUF3RTtJQUN4RSxxQkFBcUI7SUFDckIsSUFDRSxDQUFBLE9BQU8sYUFBUCxPQUFPLHVCQUFQLE9BQU8sQ0FBRSxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBSyxDQUFDLEVBQzVGO1FBQ0EsSUFBSSxTQUFTLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUM3QixJQUFJLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxFQUFFO1lBQ2pDLElBQUksV0FBVyxHQUFHLFNBQVMsQ0FBQyxVQUEyQyxDQUFDO1lBQ3hFLElBQUksQ0FBQyxZQUFZLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDakY7S0FDRjtJQUNELFVBQVUsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDO0FBQzVCLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLElBQWdCLEVBQUUsTUFBd0I7SUFDcEUsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSw2QkFBNkIsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0FBQ2xGLENBQUM7QUFFRCxTQUFTLElBQUksQ0FBQyxJQUFvQztJQUNoRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssZUFBZSxFQUFFO1FBQ2pDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQztLQUNuQjtTQUFNO1FBQ0wsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO0tBQ2xCO0FBQ0gsQ0FBQztBQUVELGtCQUFlLFVBQVUsQ0FBVSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IE5vZGVQYXRoIH0gZnJvbSAnQGJhYmVsL3RyYXZlcnNlJztcbmltcG9ydCB0eXBlICogYXMgQmFiZWwgZnJvbSAnQGJhYmVsL2NvcmUnO1xuaW1wb3J0IHR5cGUgeyB0eXBlcyBhcyB0IH0gZnJvbSAnQGJhYmVsL2NvcmUnO1xuaW1wb3J0IHsgSW1wb3J0VXRpbCB9IGZyb20gJ2JhYmVsLWltcG9ydC11dGlsJztcbmltcG9ydCB7IEV4cHJlc3Npb25QYXJzZXIgfSBmcm9tICcuL2V4cHJlc3Npb24tcGFyc2VyJztcbmltcG9ydCB7IEpTVXRpbHMsIEV4dGVuZGVkUGx1Z2luQnVpbGRlciB9IGZyb20gJy4vanMtdXRpbHMnO1xuaW1wb3J0IHR5cGUgeyBFbWJlclRlbXBsYXRlQ29tcGlsZXIsIFByZXByb2Nlc3NPcHRpb25zIH0gZnJvbSAnLi9lbWJlci10ZW1wbGF0ZS1jb21waWxlcic7XG5pbXBvcnQgeyBMZWdhY3lNb2R1bGVOYW1lIH0gZnJvbSAnLi9wdWJsaWMtdHlwZXMnO1xuXG5leHBvcnQgKiBmcm9tICcuL3B1YmxpYy10eXBlcyc7XG5cbnR5cGUgTW9kdWxlTmFtZSA9IExlZ2FjeU1vZHVsZU5hbWUgfCAnQGVtYmVyL3RlbXBsYXRlLWNvbXBpbGF0aW9uJztcblxuaW50ZXJmYWNlIE1vZHVsZUNvbmZpZyB7XG4gIG1vZHVsZU5hbWU6IE1vZHVsZU5hbWU7XG4gIGV4cG9ydDogc3RyaW5nO1xuICBhbGxvd1RlbXBsYXRlTGl0ZXJhbDogYm9vbGVhbjtcbiAgZW5hYmxlU2NvcGU6IGJvb2xlYW47XG59XG5cbmNvbnN0IElOTElORV9QUkVDT01QSUxFX01PRFVMRVM6IE1vZHVsZUNvbmZpZ1tdID0gW1xuICB7XG4gICAgbW9kdWxlTmFtZTogJ2VtYmVyLWNsaS1odG1sYmFycycsXG4gICAgZXhwb3J0OiAnaGJzJyxcbiAgICBhbGxvd1RlbXBsYXRlTGl0ZXJhbDogdHJ1ZSxcbiAgICBlbmFibGVTY29wZTogZmFsc2UsXG4gIH0sXG4gIHtcbiAgICBtb2R1bGVOYW1lOiAnZW1iZXItY2xpLWh0bWxiYXJzLWlubGluZS1wcmVjb21waWxlJyxcbiAgICBleHBvcnQ6ICdkZWZhdWx0JyxcbiAgICBhbGxvd1RlbXBsYXRlTGl0ZXJhbDogdHJ1ZSxcbiAgICBlbmFibGVTY29wZTogZmFsc2UsXG4gIH0sXG4gIHtcbiAgICBtb2R1bGVOYW1lOiAnaHRtbGJhcnMtaW5saW5lLXByZWNvbXBpbGUnLFxuICAgIGV4cG9ydDogJ2RlZmF1bHQnLFxuICAgIGFsbG93VGVtcGxhdGVMaXRlcmFsOiB0cnVlLFxuICAgIGVuYWJsZVNjb3BlOiBmYWxzZSxcbiAgfSxcbiAge1xuICAgIG1vZHVsZU5hbWU6ICdAZW1iZXIvdGVtcGxhdGUtY29tcGlsYXRpb24nLFxuICAgIGV4cG9ydDogJ3ByZWNvbXBpbGVUZW1wbGF0ZScsXG4gICAgYWxsb3dUZW1wbGF0ZUxpdGVyYWw6IGZhbHNlLFxuICAgIGVuYWJsZVNjb3BlOiB0cnVlLFxuICB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBPcHRpb25zIHtcbiAgLy8gVGhlIGVtYmVyLXRlbXBsYXRlLWNvbXBpbGVyLmpzIG1vZHVsZSB0aGF0IHNoaXBzIHdpdGhpbiB5b3VyIGVtYmVyLXNvdXJjZSB2ZXJzaW9uLlxuICBjb21waWxlcjogRW1iZXJUZW1wbGF0ZUNvbXBpbGVyO1xuXG4gIC8vIEFsbG93cyB5b3UgdG8gcmVtYXAgd2hhdCBpbXBvcnRzIHdpbGwgYmUgZW1pdHRlZCBpbiBvdXIgY29tcGlsZWQgb3V0cHV0LiBCeVxuICAvLyBleGFtcGxlOlxuICAvL1xuICAvLyAgIG91dHB1dE1vZHVsZU92ZXJyaWRlczoge1xuICAvLyAgICAgJ0BlbWJlci90ZW1wbGF0ZS1mYWN0b3J5Jzoge1xuICAvLyAgICAgICBjcmVhdGVUZW1wbGF0ZUZhY3Rvcnk6IFsnY3JlYXRlVGVtcGxhdGVGYWN0b3J5JywgJ0BnbGltbWVyL2NvcmUnXSxcbiAgLy8gICAgIH1cbiAgLy8gICB9XG4gIC8vXG4gIC8vIE5vcm1hbCBFbWJlciBhcHBzIHNob3VsZG4ndCBuZWVkIHRoaXMsIGl0IGV4aXN0cyB0byBzdXBwb3J0IG90aGVyXG4gIC8vIGVudmlyb25tZW50cyBsaWtlIHN0YW5kYWxvbmUgR2xpbW1lckpTXG4gIG91dHB1dE1vZHVsZU92ZXJyaWRlcz86IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIFtzdHJpbmcsIHN0cmluZ10+PjtcblxuICAvLyBCeSBkZWZhdWx0LCB0aGlzIHBsdWdpbiBpbXBsZW1lbnRzIG9ubHkgRW1iZXIncyBzdGFibGUgcHVibGljIEFQSSBmb3JcbiAgLy8gdGVtcGxhdGUgY29tcGlsYXRpb24sIHdoaWNoIGlzOlxuICAvL1xuICAvLyAgICBpbXBvcnQgeyBwcmVjb21waWxlVGVtcGxhdGUgfSBmcm9tICdAZW1iZXIvdGVtcGxhdGUtY29tcGlsYXRpb24nO1xuICAvL1xuICAvLyBCdXQgaGlzdG9yaWNhbGx5IHRoZXJlIGFyZSBzZXZlcmFsIG90aGVyIGltcG9ydGFibGUgc3ludGF4ZXMgaW4gd2lkZXNwcmVhZFxuICAvLyB1c2UsIGFuZCB3ZSBjYW4gZW5hYmxlIHRob3NlIHRvbyBieSBpbmNsdWRpbmcgdGhlaXIgbW9kdWxlIG5hbWVzIGluIHRoaXNcbiAgLy8gbGlzdC5cbiAgZW5hYmxlTGVnYWN5TW9kdWxlcz86IExlZ2FjeU1vZHVsZU5hbWVbXTtcblxuICAvLyBDb250cm9scyB0aGUgb3V0cHV0IGZvcm1hdC5cbiAgLy9cbiAgLy8gIFwid2lyZVwiOiBUaGUgZGVmYXVsdC4gSW4gdGhlIG91dHB1dCwgeW91ciB0ZW1wbGF0ZXMgYXJlIHJlYWR5IHRvIGV4ZWN1dGUgaW5cbiAgLy8gIHRoZSBtb3N0IHBlcmZvcm1hbnQgd2F5LlxuICAvL1xuICAvLyAgXCJoYnNcIjogSW4gdGhlIG91dHB1dCwgeW91ciB0ZW1wbGF0ZXMgd2lsbCBzdGlsbCBiZSBpbiBIQlMgZm9ybWF0LlxuICAvLyAgR2VuZXJhbGx5IHRoaXMgbWVhbnMgdGhleSB3aWxsIHN0aWxsIG5lZWQgZnVydGhlciBwcm9jZXNzaW5nIGJlZm9yZVxuICAvLyAgdGhleSdyZSByZWFkeSB0byBleGVjdXRlLiBUaGUgcHVycG9zZSBvZiB0aGlzIG1vZGUgaXMgdG8gc3VwcG9ydCB0aGluZ3NcbiAgLy8gIGxpa2UgY29kZW1vZHMgYW5kIHByZS1wdWJsaWNhdGlvbiB0cmFuc2Zvcm1hdGlvbnMgaW4gbGlicmFyaWVzLlxuICB0YXJnZXRGb3JtYXQ/OiAnd2lyZScgfCAnaGJzJztcblxuICAvLyBPcHRpb25hbCBsaXN0IG9mIGN1c3RvbSB0cmFuc2Zvcm1zIHRvIGFwcGx5IHRvIHRoZSBoYW5kbGViYXJzIEFTVCBiZWZvcmVcbiAgLy8gY29tcGlsYXRpb24uXG4gIHRyYW5zZm9ybXM/OiBFeHRlbmRlZFBsdWdpbkJ1aWxkZXJbXTtcbn1cblxuaW50ZXJmYWNlIFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4ge1xuICBvcHRzOiBFbnZTcGVjaWZpY09wdGlvbnM7XG4gIG5vcm1hbGl6ZWRPcHRzOiBSZXF1aXJlZDxPcHRpb25zPjtcbiAgdXRpbDogSW1wb3J0VXRpbDtcbiAgdGVtcGxhdGVGYWN0b3J5OiB7IG1vZHVsZU5hbWU6IHN0cmluZzsgZXhwb3J0TmFtZTogc3RyaW5nIH07XG4gIHByb2dyYW06IE5vZGVQYXRoPHQuUHJvZ3JhbT47XG4gIGxhc3RJbnNlcnRlZFBhdGg6IE5vZGVQYXRoPHQuU3RhdGVtZW50PiB8IHVuZGVmaW5lZDtcbiAgZmlsZW5hbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1ha2VQbHVnaW48RW52U3BlY2lmaWNPcHRpb25zPihsb2FkT3B0aW9uczogKG9wdHM6IEVudlNwZWNpZmljT3B0aW9ucykgPT4gT3B0aW9ucykge1xuICByZXR1cm4gZnVuY3Rpb24gaHRtbGJhcnNJbmxpbmVQcmVjb21waWxlKFxuICAgIGJhYmVsOiB0eXBlb2YgQmFiZWxcbiAgKTogQmFiZWwuUGx1Z2luT2JqPFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4+IHtcbiAgICBsZXQgdCA9IGJhYmVsLnR5cGVzO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHZpc2l0b3I6IHtcbiAgICAgICAgUHJvZ3JhbToge1xuICAgICAgICAgIGVudGVyKHBhdGg6IE5vZGVQYXRoPHQuUHJvZ3JhbT4sIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+KSB7XG4gICAgICAgICAgICBzdGF0ZS5ub3JtYWxpemVkT3B0cyA9IHtcbiAgICAgICAgICAgICAgdGFyZ2V0Rm9ybWF0OiAnd2lyZScsXG4gICAgICAgICAgICAgIG91dHB1dE1vZHVsZU92ZXJyaWRlczoge30sXG4gICAgICAgICAgICAgIGVuYWJsZUxlZ2FjeU1vZHVsZXM6IFtdLFxuICAgICAgICAgICAgICB0cmFuc2Zvcm1zOiBbXSxcbiAgICAgICAgICAgICAgLi4ubG9hZE9wdGlvbnMoc3RhdGUub3B0cyksXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBzdGF0ZS50ZW1wbGF0ZUZhY3RvcnkgPSB0ZW1wbGF0ZUZhY3RvcnlDb25maWcoc3RhdGUubm9ybWFsaXplZE9wdHMpO1xuICAgICAgICAgICAgc3RhdGUudXRpbCA9IG5ldyBJbXBvcnRVdGlsKHQsIHBhdGgpO1xuICAgICAgICAgICAgc3RhdGUucHJvZ3JhbSA9IHBhdGg7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBleGl0KF9wYXRoOiBOb2RlUGF0aDx0LlByb2dyYW0+LCBzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPikge1xuICAgICAgICAgICAgaWYgKHN0YXRlLm5vcm1hbGl6ZWRPcHRzLnRhcmdldEZvcm1hdCA9PT0gJ3dpcmUnKSB7XG4gICAgICAgICAgICAgIGZvciAobGV0IHsgbW9kdWxlTmFtZSwgZXhwb3J0OiBleHBvcnROYW1lIH0gb2YgY29uZmlndXJlZE1vZHVsZXMoc3RhdGUpKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUudXRpbC5yZW1vdmVJbXBvcnQobW9kdWxlTmFtZSwgZXhwb3J0TmFtZSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuXG4gICAgICAgIFRhZ2dlZFRlbXBsYXRlRXhwcmVzc2lvbihcbiAgICAgICAgICBwYXRoOiBOb2RlUGF0aDx0LlRhZ2dlZFRlbXBsYXRlRXhwcmVzc2lvbj4sXG4gICAgICAgICAgc3RhdGU6IFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz5cbiAgICAgICAgKSB7XG4gICAgICAgICAgbGV0IHRhZ1BhdGggPSBwYXRoLmdldCgndGFnJyk7XG5cbiAgICAgICAgICBpZiAoIXRhZ1BhdGguaXNJZGVudGlmaWVyKCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG4gICAgICAgICAgbGV0IG9wdGlvbnMgPSByZWZlcmVuY2VzSW5saW5lQ29tcGlsZXIodGFnUGF0aCwgc3RhdGUpO1xuICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICghb3B0aW9ucy5hbGxvd1RlbXBsYXRlTGl0ZXJhbCkge1xuICAgICAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgICAgICBgQXR0ZW1wdGVkIHRvIHVzZSBcXGAke3RhZ1BhdGgubm9kZS5uYW1lfVxcYCBhcyBhIHRlbXBsYXRlIHRhZywgYnV0IGl0IGNhbiBvbmx5IGJlIGNhbGxlZCBhcyBhIGZ1bmN0aW9uIHdpdGggYSBzdHJpbmcgcGFzc2VkIHRvIGl0OiAke3RhZ1BhdGgubm9kZS5uYW1lfSgnY29udGVudCBoZXJlJylgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXRoLm5vZGUucXVhc2kuZXhwcmVzc2lvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgICdwbGFjZWhvbGRlcnMgaW5zaWRlIGEgdGFnZ2VkIHRlbXBsYXRlIHN0cmluZyBhcmUgbm90IHN1cHBvcnRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHRlbXBsYXRlID0gcGF0aC5ub2RlLnF1YXNpLnF1YXNpcy5tYXAoKHF1YXNpKSA9PiBxdWFzaS52YWx1ZS5jb29rZWQpLmpvaW4oJycpO1xuICAgICAgICAgIGlmIChzdGF0ZS5ub3JtYWxpemVkT3B0cy50YXJnZXRGb3JtYXQgPT09ICd3aXJlJykge1xuICAgICAgICAgICAgaW5zZXJ0Q29tcGlsZWRUZW1wbGF0ZShiYWJlbCwgc3RhdGUsIHRlbXBsYXRlLCBwYXRoLCB7fSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydFRyYW5zZm9ybWVkVGVtcGxhdGUoYmFiZWwsIHN0YXRlLCB0ZW1wbGF0ZSwgcGF0aCwge30sIG9wdGlvbnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBDYWxsRXhwcmVzc2lvbihwYXRoOiBOb2RlUGF0aDx0LkNhbGxFeHByZXNzaW9uPiwgc3RhdGU6IFN0YXRlPEVudlNwZWNpZmljT3B0aW9ucz4pIHtcbiAgICAgICAgICBsZXQgY2FsbGVlUGF0aCA9IHBhdGguZ2V0KCdjYWxsZWUnKTtcblxuICAgICAgICAgIGlmICghY2FsbGVlUGF0aC5pc0lkZW50aWZpZXIoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgICBsZXQgb3B0aW9ucyA9IHJlZmVyZW5jZXNJbmxpbmVDb21waWxlcihjYWxsZWVQYXRoLCBzdGF0ZSk7XG4gICAgICAgICAgaWYgKCFvcHRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IFtmaXJzdEFyZywgc2Vjb25kQXJnLCAuLi5yZXN0QXJnc10gPSBwYXRoLmdldCgnYXJndW1lbnRzJyk7XG5cbiAgICAgICAgICBsZXQgdGVtcGxhdGU7XG5cbiAgICAgICAgICBzd2l0Y2ggKGZpcnN0QXJnPy5ub2RlLnR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ1N0cmluZ0xpdGVyYWwnOlxuICAgICAgICAgICAgICB0ZW1wbGF0ZSA9IGZpcnN0QXJnLm5vZGUudmFsdWU7XG4gICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgY2FzZSAnVGVtcGxhdGVMaXRlcmFsJzpcbiAgICAgICAgICAgICAgaWYgKGZpcnN0QXJnLm5vZGUuZXhwcmVzc2lvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgICAgICAgICAgJ3BsYWNlaG9sZGVycyBpbnNpZGUgYSB0ZW1wbGF0ZSBzdHJpbmcgYXJlIG5vdCBzdXBwb3J0ZWQnXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZSA9IGZpcnN0QXJnLm5vZGUucXVhc2lzLm1hcCgocXVhc2kpID0+IHF1YXNpLnZhbHVlLmNvb2tlZCkuam9pbignJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdUYWdnZWRUZW1wbGF0ZUV4cHJlc3Npb24nOlxuICAgICAgICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICAgICAgYHRhZ2dlZCB0ZW1wbGF0ZSBzdHJpbmdzIGluc2lkZSAke2NhbGxlZVBhdGgubm9kZS5uYW1lfSBhcmUgbm90IHN1cHBvcnRlZGBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IHBhdGguYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICAgICAgICBgJHtjYWxsZWVQYXRoLm5vZGUubmFtZX0gc2hvdWxkIGJlIGludm9rZWQgd2l0aCBhdCBsZWFzdCBhIHNpbmdsZSBhcmd1bWVudCAodGhlIHRlbXBsYXRlIHN0cmluZylgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgbGV0IHVzZXJUeXBlZE9wdGlvbnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4gICAgICAgICAgaWYgKCFzZWNvbmRBcmcpIHtcbiAgICAgICAgICAgIHVzZXJUeXBlZE9wdGlvbnMgPSB7fTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKCFzZWNvbmRBcmcuaXNPYmplY3RFeHByZXNzaW9uKCkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgICAgICAgIGAke2NhbGxlZVBhdGgubm9kZS5uYW1lfSBjYW4gb25seSBiZSBpbnZva2VkIHdpdGggMiBhcmd1bWVudHM6IHRoZSB0ZW1wbGF0ZSBzdHJpbmcsIGFuZCBhbnkgc3RhdGljIG9wdGlvbnNgXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHVzZXJUeXBlZE9wdGlvbnMgPSBuZXcgRXhwcmVzc2lvblBhcnNlcihiYWJlbCkucGFyc2VPYmplY3RFeHByZXNzaW9uKFxuICAgICAgICAgICAgICBjYWxsZWVQYXRoLm5vZGUubmFtZSxcbiAgICAgICAgICAgICAgc2Vjb25kQXJnLFxuICAgICAgICAgICAgICBvcHRpb25zLmVuYWJsZVNjb3BlXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVzdEFyZ3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgICAgICBgJHtjYWxsZWVQYXRoLm5vZGUubmFtZX0gY2FuIG9ubHkgYmUgaW52b2tlZCB3aXRoIDIgYXJndW1lbnRzOiB0aGUgdGVtcGxhdGUgc3RyaW5nLCBhbmQgYW55IHN0YXRpYyBvcHRpb25zYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHN0YXRlLm5vcm1hbGl6ZWRPcHRzLnRhcmdldEZvcm1hdCA9PT0gJ3dpcmUnKSB7XG4gICAgICAgICAgICBpbnNlcnRDb21waWxlZFRlbXBsYXRlKGJhYmVsLCBzdGF0ZSwgdGVtcGxhdGUsIHBhdGgsIHVzZXJUeXBlZE9wdGlvbnMpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRUcmFuc2Zvcm1lZFRlbXBsYXRlKGJhYmVsLCBzdGF0ZSwgdGVtcGxhdGUsIHBhdGgsIHVzZXJUeXBlZE9wdGlvbnMsIG9wdGlvbnMpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgfTtcbiAgfSBhcyAoYmFiZWw6IHR5cGVvZiBCYWJlbCkgPT4gQmFiZWwuUGx1Z2luT2JqPHVua25vd24+O1xufVxuXG5mdW5jdGlvbiogY29uZmlndXJlZE1vZHVsZXM8RW52U3BlY2lmaWNPcHRpb25zPihzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPikge1xuICBmb3IgKGxldCBtb2R1bGVDb25maWcgb2YgSU5MSU5FX1BSRUNPTVBJTEVfTU9EVUxFUykge1xuICAgIGlmIChcbiAgICAgIG1vZHVsZUNvbmZpZy5tb2R1bGVOYW1lICE9PSAnQGVtYmVyL3RlbXBsYXRlLWNvbXBpbGF0aW9uJyAmJlxuICAgICAgIXN0YXRlLm5vcm1hbGl6ZWRPcHRzLmVuYWJsZUxlZ2FjeU1vZHVsZXMuaW5jbHVkZXMobW9kdWxlQ29uZmlnLm1vZHVsZU5hbWUpXG4gICAgKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgeWllbGQgbW9kdWxlQ29uZmlnO1xuICB9XG59XG5cbmZ1bmN0aW9uIHJlZmVyZW5jZXNJbmxpbmVDb21waWxlcjxFbnZTcGVjaWZpY09wdGlvbnM+KFxuICBwYXRoOiBOb2RlUGF0aDx0LklkZW50aWZpZXI+LFxuICBzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPlxuKTogTW9kdWxlQ29uZmlnIHwgdW5kZWZpbmVkIHtcbiAgZm9yIChsZXQgbW9kdWxlQ29uZmlnIG9mIGNvbmZpZ3VyZWRNb2R1bGVzKHN0YXRlKSkge1xuICAgIGlmIChwYXRoLnJlZmVyZW5jZXNJbXBvcnQobW9kdWxlQ29uZmlnLm1vZHVsZU5hbWUsIG1vZHVsZUNvbmZpZy5leHBvcnQpKSB7XG4gICAgICByZXR1cm4gbW9kdWxlQ29uZmlnO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBydW50aW1lRXJyb3JJSUZFKGJhYmVsOiB0eXBlb2YgQmFiZWwsIHJlcGxhY2VtZW50czogeyBFUlJPUl9NRVNTQUdFOiBzdHJpbmcgfSkge1xuICBsZXQgc3RhdGVtZW50ID0gYmFiZWwudGVtcGxhdGUoYChmdW5jdGlvbigpIHtcXG4gIHRocm93IG5ldyBFcnJvcignRVJST1JfTUVTU0FHRScpO1xcbn0pKCk7YCkoXG4gICAgcmVwbGFjZW1lbnRzXG4gICkgYXMgdC5FeHByZXNzaW9uU3RhdGVtZW50O1xuICByZXR1cm4gc3RhdGVtZW50LmV4cHJlc3Npb247XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUHJlY29tcGlsZU9wdGlvbnM8RW52U3BlY2lmaWNPcHRpb25zPihcbiAgYmFiZWw6IHR5cGVvZiBCYWJlbCxcbiAgdGFyZ2V0OiBOb2RlUGF0aDx0LkV4cHJlc3Npb24+LFxuICBzdGF0ZTogU3RhdGU8RW52U3BlY2lmaWNPcHRpb25zPixcbiAgdGVtcGxhdGU6IHN0cmluZyxcbiAgdXNlclR5cGVkT3B0aW9uczogUmVjb3JkPHN0cmluZywgdW5rbm93bj5cbik6IFByZXByb2Nlc3NPcHRpb25zICYgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuICBpZiAoIXVzZXJUeXBlZE9wdGlvbnMubG9jYWxzKSB7XG4gICAgdXNlclR5cGVkT3B0aW9ucy5sb2NhbHMgPSBbXTtcbiAgfVxuICBsZXQganN1dGlscyA9IG5ldyBKU1V0aWxzKGJhYmVsLCBzdGF0ZSwgdGFyZ2V0LCB1c2VyVHlwZWRPcHRpb25zLmxvY2FscyBhcyBzdHJpbmdbXSwgc3RhdGUudXRpbCk7XG4gIGxldCBtZXRhID0gT2JqZWN0LmFzc2lnbih7IGpzdXRpbHMgfSwgdXNlclR5cGVkT3B0aW9ucz8ubWV0YSk7XG4gIHJldHVybiBPYmplY3QuYXNzaWduKFxuICAgIHtcbiAgICAgIGNvbnRlbnRzOiB0ZW1wbGF0ZSxcbiAgICAgIG1ldGEsXG5cbiAgICAgIC8vIFRPRE86IGVtYnJvaWRlcidzIHRlbXBsYXRlLWNvbXBpbGVyIGFsbG93cyB0aGlzIHRvIGJlIG92ZXJyaWRlbiB0byBnZXRcbiAgICAgIC8vIGJhY2t3YXJkLWNvbXBhdGlibGUgbW9kdWxlIG5hbWVzIHRoYXQgZG9uJ3QgbWF0Y2ggdGhlIHJlYWwgbmFtZSBvZiB0aGVcbiAgICAgIC8vIG9uLWRpc2sgZmlsZS4gV2hhdCdzIG91ciBwbGFuIGZvciBtaWdyYXRpbmcgcGVvcGxlIGF3YXkgZnJvbSB0aGF0P1xuICAgICAgbW9kdWxlTmFtZTogc3RhdGUuZmlsZW5hbWUsXG5cbiAgICAgIC8vIFRoaXMgaXMgaGVyZSBzbyBpdCdzICphbHdheXMqIHRoZSByZWFsIGZpbGVuYW1lLiBIaXN0b3JpY2FsbHksIHRoZXJlIGlzXG4gICAgICAvLyBhbHNvIGBtb2R1bGVOYW1lYCBidXQgdGhhdCBkaWQgbm90IG1hdGNoIHRoZSByZWFsIG9uLWRpc2sgZmlsZW5hbWUsIGl0XG4gICAgICAvLyB3YXMgdGhlIG5vdGlvbmFsIHJ1bnRpbWUgbW9kdWxlIG5hbWUgZnJvbSBjbGFzc2ljIGVtYmVyIGJ1aWxkcy5cbiAgICAgIGZpbGVuYW1lOiBzdGF0ZS5maWxlbmFtZSxcblxuICAgICAgcGx1Z2luczoge1xuICAgICAgICBhc3Q6IHN0YXRlLm5vcm1hbGl6ZWRPcHRzLnRyYW5zZm9ybXMsXG4gICAgICB9LFxuICAgIH0sXG4gICAgdXNlclR5cGVkT3B0aW9uc1xuICApO1xufVxuXG5mdW5jdGlvbiBpbnNlcnRDb21waWxlZFRlbXBsYXRlPEVudlNwZWNpZmljT3B0aW9ucz4oXG4gIGJhYmVsOiB0eXBlb2YgQmFiZWwsXG4gIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+LFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuICB0YXJnZXQ6IE5vZGVQYXRoPHQuRXhwcmVzc2lvbj4sXG4gIHVzZXJUeXBlZE9wdGlvbnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+XG4pIHtcbiAgbGV0IHQgPSBiYWJlbC50eXBlcztcbiAgbGV0IG9wdGlvbnMgPSBidWlsZFByZWNvbXBpbGVPcHRpb25zKGJhYmVsLCB0YXJnZXQsIHN0YXRlLCB0ZW1wbGF0ZSwgdXNlclR5cGVkT3B0aW9ucyk7XG5cbiAgbGV0IHByZWNvbXBpbGVSZXN1bHRTdHJpbmc6IHN0cmluZztcblxuICBpZiAob3B0aW9ucy5pbnNlcnRSdW50aW1lRXJyb3JzKSB7XG4gICAgdHJ5IHtcbiAgICAgIHByZWNvbXBpbGVSZXN1bHRTdHJpbmcgPSBzdGF0ZS5ub3JtYWxpemVkT3B0cy5jb21waWxlci5wcmVjb21waWxlKHRlbXBsYXRlLCBvcHRpb25zKTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGFyZ2V0LnJlcGxhY2VXaXRoKHJ1bnRpbWVFcnJvcklJRkUoYmFiZWwsIHsgRVJST1JfTUVTU0FHRTogKGVycm9yIGFzIGFueSkubWVzc2FnZSB9KSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHByZWNvbXBpbGVSZXN1bHRTdHJpbmcgPSBzdGF0ZS5ub3JtYWxpemVkT3B0cy5jb21waWxlci5wcmVjb21waWxlKHRlbXBsYXRlLCBvcHRpb25zKTtcbiAgfVxuXG4gIGxldCBwcmVjb21waWxlUmVzdWx0QVNUID0gYmFiZWwucGFyc2UoYHZhciBwcmVjb21waWxlUmVzdWx0ID0gJHtwcmVjb21waWxlUmVzdWx0U3RyaW5nfTtgLCB7XG4gICAgYmFiZWxyYzogZmFsc2UsXG4gICAgY29uZmlnRmlsZTogZmFsc2UsXG4gIH0pIGFzIHQuRmlsZTtcblxuICBsZXQgdGVtcGxhdGVFeHByZXNzaW9uID0gKHByZWNvbXBpbGVSZXN1bHRBU1QucHJvZ3JhbS5ib2R5WzBdIGFzIHQuVmFyaWFibGVEZWNsYXJhdGlvbilcbiAgICAuZGVjbGFyYXRpb25zWzBdLmluaXQgYXMgdC5FeHByZXNzaW9uO1xuXG4gIHQuYWRkQ29tbWVudChcbiAgICB0ZW1wbGF0ZUV4cHJlc3Npb24sXG4gICAgJ2xlYWRpbmcnLFxuICAgIGBcXG4gICR7dGVtcGxhdGUucmVwbGFjZSgvXFwqXFwvL2csICcqXFxcXC8nKX1cXG5gLFxuICAgIC8qIGxpbmUgY29tbWVudD8gKi8gZmFsc2VcbiAgKTtcblxuICBsZXQgdGVtcGxhdGVGYWN0b3J5SWRlbnRpZmllciA9IHN0YXRlLnV0aWwuaW1wb3J0KFxuICAgIHRhcmdldCxcbiAgICBzdGF0ZS50ZW1wbGF0ZUZhY3RvcnkubW9kdWxlTmFtZSxcbiAgICBzdGF0ZS50ZW1wbGF0ZUZhY3RvcnkuZXhwb3J0TmFtZVxuICApO1xuICB0YXJnZXQucmVwbGFjZVdpdGgodC5jYWxsRXhwcmVzc2lvbih0ZW1wbGF0ZUZhY3RvcnlJZGVudGlmaWVyLCBbdGVtcGxhdGVFeHByZXNzaW9uXSkpO1xufVxuXG5mdW5jdGlvbiBpbnNlcnRUcmFuc2Zvcm1lZFRlbXBsYXRlPEVudlNwZWNpZmljT3B0aW9ucz4oXG4gIGJhYmVsOiB0eXBlb2YgQmFiZWwsXG4gIHN0YXRlOiBTdGF0ZTxFbnZTcGVjaWZpY09wdGlvbnM+LFxuICB0ZW1wbGF0ZTogc3RyaW5nLFxuICB0YXJnZXQ6IE5vZGVQYXRoPHQuQ2FsbEV4cHJlc3Npb24+IHwgTm9kZVBhdGg8dC5UYWdnZWRUZW1wbGF0ZUV4cHJlc3Npb24+LFxuICB1c2VyVHlwZWRPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcbiAgZm9ybWF0T3B0aW9uczogTW9kdWxlQ29uZmlnXG4pIHtcbiAgbGV0IHQgPSBiYWJlbC50eXBlcztcbiAgbGV0IG9wdGlvbnMgPSBidWlsZFByZWNvbXBpbGVPcHRpb25zKGJhYmVsLCB0YXJnZXQsIHN0YXRlLCB0ZW1wbGF0ZSwgdXNlclR5cGVkT3B0aW9ucyk7XG4gIGxldCBhc3QgPSBzdGF0ZS5ub3JtYWxpemVkT3B0cy5jb21waWxlci5fcHJlcHJvY2Vzcyh0ZW1wbGF0ZSwgeyAuLi5vcHRpb25zLCBtb2RlOiAnY29kZW1vZCcgfSk7XG4gIGxldCB0cmFuc2Zvcm1lZCA9IHN0YXRlLm5vcm1hbGl6ZWRPcHRzLmNvbXBpbGVyLl9wcmludChhc3QpO1xuICBpZiAodGFyZ2V0LmlzQ2FsbEV4cHJlc3Npb24oKSkge1xuICAgICh0YXJnZXQuZ2V0KCdhcmd1bWVudHMuMCcpIGFzIE5vZGVQYXRoPHQuTm9kZT4pLnJlcGxhY2VXaXRoKHQuc3RyaW5nTGl0ZXJhbCh0cmFuc2Zvcm1lZCkpO1xuICAgIGlmIChvcHRpb25zLmxvY2FscyAmJiBvcHRpb25zLmxvY2Fscy5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIWZvcm1hdE9wdGlvbnMuZW5hYmxlU2NvcGUpIHtcbiAgICAgICAgbWF5YmVQcnVuZUltcG9ydChzdGF0ZS51dGlsLCB0YXJnZXQuZ2V0KCdjYWxsZWUnKSk7XG4gICAgICAgIHRhcmdldC5zZXQoJ2NhbGxlZScsIHByZWNvbXBpbGVUZW1wbGF0ZShzdGF0ZS51dGlsLCB0YXJnZXQpKTtcbiAgICAgIH1cbiAgICAgIHVwZGF0ZVNjb3BlKGJhYmVsLCB0YXJnZXQsIG9wdGlvbnMubG9jYWxzKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKG9wdGlvbnMubG9jYWxzICYmIG9wdGlvbnMubG9jYWxzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIG5lZWQgdG8gYWRkIHNjb3BlLCBzbyBuZWVkIHRvIHJlcGxhY2UgdGhlIGJhY2t0aWNrcyBmb3JtIHdpdGggYSBjYWxsXG4gICAgICAvLyBleHByZXNzaW9uIHRvIHByZWNvbXBpbGVUZW1wbGF0ZVxuICAgICAgbWF5YmVQcnVuZUltcG9ydChzdGF0ZS51dGlsLCB0YXJnZXQuZ2V0KCd0YWcnKSk7XG4gICAgICBsZXQgbmV3Q2FsbCA9IHRhcmdldC5yZXBsYWNlV2l0aChcbiAgICAgICAgdC5jYWxsRXhwcmVzc2lvbihwcmVjb21waWxlVGVtcGxhdGUoc3RhdGUudXRpbCwgdGFyZ2V0KSwgW3Quc3RyaW5nTGl0ZXJhbCh0cmFuc2Zvcm1lZCldKVxuICAgICAgKVswXTtcbiAgICAgIHVwZGF0ZVNjb3BlKGJhYmVsLCBuZXdDYWxsLCBvcHRpb25zLmxvY2Fscyk7XG4gICAgfSBlbHNlIHtcbiAgICAgICh0YXJnZXQuZ2V0KCdxdWFzaScpLmdldCgncXVhc2lzLjAnKSBhcyBOb2RlUGF0aDx0LlRlbXBsYXRlRWxlbWVudD4pLnJlcGxhY2VXaXRoKFxuICAgICAgICB0LnRlbXBsYXRlRWxlbWVudCh7IHJhdzogdHJhbnNmb3JtZWQgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHRlbXBsYXRlRmFjdG9yeUNvbmZpZyhvcHRzOiBSZXF1aXJlZDxPcHRpb25zPikge1xuICBsZXQgbW9kdWxlTmFtZSA9ICdAZW1iZXIvdGVtcGxhdGUtZmFjdG9yeSc7XG4gIGxldCBleHBvcnROYW1lID0gJ2NyZWF0ZVRlbXBsYXRlRmFjdG9yeSc7XG4gIGxldCBvdmVycmlkZXMgPSBvcHRzLm91dHB1dE1vZHVsZU92ZXJyaWRlc1ttb2R1bGVOYW1lXT8uW2V4cG9ydE5hbWVdO1xuICByZXR1cm4gb3ZlcnJpZGVzXG4gICAgPyB7IGV4cG9ydE5hbWU6IG92ZXJyaWRlc1swXSwgbW9kdWxlTmFtZTogb3ZlcnJpZGVzWzFdIH1cbiAgICA6IHsgZXhwb3J0TmFtZSwgbW9kdWxlTmFtZSB9O1xufVxuXG5mdW5jdGlvbiBidWlsZFNjb3BlKGJhYmVsOiB0eXBlb2YgQmFiZWwsIGxvY2Fsczogc3RyaW5nW10pIHtcbiAgbGV0IHQgPSBiYWJlbC50eXBlcztcbiAgcmV0dXJuIHQuYXJyb3dGdW5jdGlvbkV4cHJlc3Npb24oXG4gICAgW10sXG4gICAgdC5vYmplY3RFeHByZXNzaW9uKFxuICAgICAgbG9jYWxzLm1hcCgobmFtZSkgPT4gdC5vYmplY3RQcm9wZXJ0eSh0LmlkZW50aWZpZXIobmFtZSksIHQuaWRlbnRpZmllcihuYW1lKSwgZmFsc2UsIHRydWUpKVxuICAgIClcbiAgKTtcbn1cbmZ1bmN0aW9uIHVwZGF0ZVNjb3BlKGJhYmVsOiB0eXBlb2YgQmFiZWwsIHRhcmdldDogTm9kZVBhdGg8dC5DYWxsRXhwcmVzc2lvbj4sIGxvY2Fsczogc3RyaW5nW10pIHtcbiAgbGV0IHQgPSBiYWJlbC50eXBlcztcbiAgbGV0IHNlY29uZEFyZyA9IHRhcmdldC5nZXQoJ2FyZ3VtZW50cy4xJykgYXMgTm9kZVBhdGg8dC5PYmplY3RFeHByZXNzaW9uPiB8IHVuZGVmaW5lZDtcbiAgaWYgKHNlY29uZEFyZykge1xuICAgIGxldCBzY29wZSA9IHNlY29uZEFyZy5nZXQoJ3Byb3BlcnRpZXMnKS5maW5kKChwKSA9PiB7XG4gICAgICBsZXQga2V5ID0gcC5nZXQoJ2tleScpIGFzIE5vZGVQYXRoPHQuTm9kZT47XG4gICAgICByZXR1cm4ga2V5LmlzSWRlbnRpZmllcigpICYmIGtleS5ub2RlLm5hbWUgPT09ICdzY29wZSc7XG4gICAgfSk7XG4gICAgaWYgKHNjb3BlKSB7XG4gICAgICBzY29wZS5zZXQoJ3ZhbHVlJywgYnVpbGRTY29wZShiYWJlbCwgbG9jYWxzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlY29uZEFyZy5wdXNoQ29udGFpbmVyKFxuICAgICAgICAncHJvcGVydGllcycsXG4gICAgICAgIHQub2JqZWN0UHJvcGVydHkodC5pZGVudGlmaWVyKCdzY29wZScpLCBidWlsZFNjb3BlKGJhYmVsLCBsb2NhbHMpKVxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0LnB1c2hDb250YWluZXIoXG4gICAgICAnYXJndW1lbnRzJyxcbiAgICAgIHQub2JqZWN0RXhwcmVzc2lvbihbdC5vYmplY3RQcm9wZXJ0eSh0LmlkZW50aWZpZXIoJ3Njb3BlJyksIGJ1aWxkU2NvcGUoYmFiZWwsIGxvY2FscykpXSlcbiAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1heWJlUHJ1bmVJbXBvcnQoXG4gIHV0aWw6IEltcG9ydFV0aWwsXG4gIGlkZW50aWZpZXI6IE5vZGVQYXRoPHQuRXhwcmVzc2lvbiB8IHQuVjhJbnRyaW5zaWNJZGVudGlmaWVyPlxuKSB7XG4gIGlmICghaWRlbnRpZmllci5pc0lkZW50aWZpZXIoKSkge1xuICAgIHJldHVybjtcbiAgfVxuICBsZXQgYmluZGluZyA9IGlkZW50aWZpZXIuc2NvcGUuZ2V0QmluZGluZyhpZGVudGlmaWVyLm5vZGUubmFtZSk7XG4gIC8vIHRoaXMgY2hlY2tzIGlmIHRoZSBpZGVudGlmaWVyICh0aGF0IHdlJ3JlIGFib3V0IHRvIHJlbW92ZSkgaXMgdXNlZCBpblxuICAvLyBleGFjdGx5IG9uZSBwbGFjZS5cbiAgaWYgKFxuICAgIGJpbmRpbmc/LnJlZmVyZW5jZVBhdGhzLnJlZHVjZSgoY291bnQsIHBhdGgpID0+IChwYXRoLnJlbW92ZWQgPyBjb3VudCA6IGNvdW50ICsgMSksIDApID09PSAxXG4gICkge1xuICAgIGxldCBzcGVjaWZpZXIgPSBiaW5kaW5nLnBhdGg7XG4gICAgaWYgKHNwZWNpZmllci5pc0ltcG9ydFNwZWNpZmllcigpKSB7XG4gICAgICBsZXQgZGVjbGFyYXRpb24gPSBzcGVjaWZpZXIucGFyZW50UGF0aCBhcyBOb2RlUGF0aDx0LkltcG9ydERlY2xhcmF0aW9uPjtcbiAgICAgIHV0aWwucmVtb3ZlSW1wb3J0KGRlY2xhcmF0aW9uLm5vZGUuc291cmNlLnZhbHVlLCBuYW1lKHNwZWNpZmllci5ub2RlLmltcG9ydGVkKSk7XG4gICAgfVxuICB9XG4gIGlkZW50aWZpZXIucmVtb3ZlZCA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIHByZWNvbXBpbGVUZW1wbGF0ZSh1dGlsOiBJbXBvcnRVdGlsLCB0YXJnZXQ6IE5vZGVQYXRoPHQuTm9kZT4pIHtcbiAgcmV0dXJuIHV0aWwuaW1wb3J0KHRhcmdldCwgJ0BlbWJlci90ZW1wbGF0ZS1jb21waWxhdGlvbicsICdwcmVjb21waWxlVGVtcGxhdGUnKTtcbn1cblxuZnVuY3Rpb24gbmFtZShub2RlOiB0LlN0cmluZ0xpdGVyYWwgfCB0LklkZW50aWZpZXIpIHtcbiAgaWYgKG5vZGUudHlwZSA9PT0gJ1N0cmluZ0xpdGVyYWwnKSB7XG4gICAgcmV0dXJuIG5vZGUudmFsdWU7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5vZGUubmFtZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBtYWtlUGx1Z2luPE9wdGlvbnM+KChvcHRpb25zKSA9PiBvcHRpb25zKTtcbiJdfQ==