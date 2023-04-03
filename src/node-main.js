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
const path_1 = require("path");
const plugin_1 = require("./plugin");
const ember_template_compiler_1 = require("./ember-template-compiler");
__exportStar(require("./public-types"), exports);
function cwdRequire(moduleName) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(require.resolve(moduleName, { paths: [process.cwd()] }));
}
function handleNodeSpecificOptions(opts) {
    let compiler;
    if (opts.compilerPath) {
        let mod = cwdRequire(opts.compilerPath);
        (0, ember_template_compiler_1.assertTemplateCompiler)(mod);
        compiler = mod;
    }
    else if (opts.compiler) {
        (0, ember_template_compiler_1.assertTemplateCompiler)(opts.compiler);
        compiler = opts.compiler;
    }
    else {
        throw new Error(`must provide compilerPath or compiler`);
    }
    let transforms = [];
    if (opts.transforms) {
        transforms = opts.transforms.map((t) => {
            if (typeof t === 'string') {
                return esCompat(cwdRequire(t)).default;
            }
            else if (Array.isArray(t) && typeof t[0] === 'string') {
                return esCompat(cwdRequire(t[0])).default.call(undefined, t[1]);
            }
            else {
                return t;
            }
        });
    }
    return Object.assign(Object.assign({}, opts), { transforms, compiler });
}
const htmlbarsInlinePrecompile = (0, plugin_1.makePlugin)(handleNodeSpecificOptions);
htmlbarsInlinePrecompile._parallelBabel = {
    requireFile: __filename,
};
htmlbarsInlinePrecompile.baseDir = function () {
    return (0, path_1.resolve)(__dirname, '..');
};
exports.default = htmlbarsInlinePrecompile;
function esCompat(m) {
    return (m === null || m === void 0 ? void 0 : m.__esModule) ? m : { default: m };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZS1tYWluLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibm9kZS1tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwrQkFBK0I7QUFDL0IscUNBQXNDO0FBR3RDLHVFQUEwRjtBQUcxRixpREFBK0I7QUF1Qi9CLFNBQVMsVUFBVSxDQUFDLFVBQWtCO0lBQ3BDLDhEQUE4RDtJQUM5RCxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxFQUFFLEtBQUssRUFBRSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQzFFLENBQUM7QUFFRCxTQUFTLHlCQUF5QixDQUFDLElBQWE7SUFDOUMsSUFBSSxRQUErQixDQUFDO0lBQ3BDLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtRQUNyQixJQUFJLEdBQUcsR0FBUSxVQUFVLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzdDLElBQUEsZ0RBQXNCLEVBQUMsR0FBRyxDQUFDLENBQUM7UUFDNUIsUUFBUSxHQUFHLEdBQUcsQ0FBQztLQUNoQjtTQUFNLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRTtRQUN4QixJQUFBLGdEQUFzQixFQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN0QyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztLQUMxQjtTQUFNO1FBQ0wsTUFBTSxJQUFJLEtBQUssQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO0tBQzFEO0lBRUQsSUFBSSxVQUFVLEdBQUcsRUFBRSxDQUFDO0lBQ3BCLElBQUksSUFBSSxDQUFDLFVBQVUsRUFBRTtRQUNuQixVQUFVLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUNyQyxJQUFJLE9BQU8sQ0FBQyxLQUFLLFFBQVEsRUFBRTtnQkFDekIsT0FBTyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDO2FBQ3hDO2lCQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxRQUFRLEVBQUU7Z0JBQ3ZELE9BQU8sUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2pFO2lCQUFNO2dCQUNMLE9BQU8sQ0FBQyxDQUFDO2FBQ1Y7UUFDSCxDQUFDLENBQUMsQ0FBQztLQUNKO0lBQ0QsdUNBQVksSUFBSSxLQUFFLFVBQVUsRUFBRSxRQUFRLElBQUc7QUFDM0MsQ0FBQztBQUVELE1BQU0sd0JBQXdCLEdBQUcsSUFBQSxtQkFBVSxFQUFDLHlCQUF5QixDQUFDLENBQUM7QUFFdEUsd0JBQWdDLENBQUMsY0FBYyxHQUFHO0lBQ2pELFdBQVcsRUFBRSxVQUFVO0NBQ3hCLENBQUM7QUFFRCx3QkFBZ0MsQ0FBQyxPQUFPLEdBQUc7SUFDMUMsT0FBTyxJQUFBLGNBQU8sRUFBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbEMsQ0FBQyxDQUFDO0FBRUYsa0JBQWUsd0JBR2QsQ0FBQztBQUVGLFNBQVMsUUFBUSxDQUFDLENBQXNCO0lBQ3RDLE9BQU8sQ0FBQSxDQUFDLGFBQUQsQ0FBQyx1QkFBRCxDQUFDLENBQUUsVUFBVSxFQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQzVDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBtYWtlUGx1Z2luIH0gZnJvbSAnLi9wbHVnaW4nO1xuXG5pbXBvcnQgeyBPcHRpb25zIGFzIFNoYXJlZE9wdGlvbnMgfSBmcm9tICcuL3BsdWdpbic7XG5pbXBvcnQgeyBhc3NlcnRUZW1wbGF0ZUNvbXBpbGVyLCBFbWJlclRlbXBsYXRlQ29tcGlsZXIgfSBmcm9tICcuL2VtYmVyLXRlbXBsYXRlLWNvbXBpbGVyJztcbmltcG9ydCB7IEV4dGVuZGVkUGx1Z2luQnVpbGRlciB9IGZyb20gJy4vanMtdXRpbHMnO1xuXG5leHBvcnQgKiBmcm9tICcuL3B1YmxpYy10eXBlcyc7XG5cbmV4cG9ydCB0eXBlIFRyYW5zZm9ybSA9IEV4dGVuZGVkUGx1Z2luQnVpbGRlciB8IHN0cmluZyB8IFtzdHJpbmcsIHVua25vd25dO1xuXG5leHBvcnQgdHlwZSBPcHRpb25zID0gT21pdDxTaGFyZWRPcHRpb25zLCAndHJhbnNmb3JtcycgfCAnY29tcGlsZXInPiAmIHtcbiAgLy8gVGhlIG9uLWRpc2sgcGF0aCB0byB0aGUgZW1iZXItdGVtcGxhdGUtY29taXBsZXIuanMgbW9kdWxlIGZvciBvdXIgY3VycmVudFxuICAvLyBlbWJlciB2ZXJzaW9uLiBZb3UgbmVlZCB0byBlaXRoZXIgc2V0IGBjb21waWxlclBhdGhgIG9yIHNldCBgY29tcGlsZXJgLlxuICBjb21waWxlclBhdGg/OiBzdHJpbmc7XG5cbiAgLy8gVGhlIGVtYmVyLXRlbXBsYXRlLWNvbXBpbGVyLmpzIG1vZHVsZSB0aGF0IHNoaXBzIHdpdGhpbiB5b3VyIGVtYmVyLXNvdXJjZVxuICAvLyB2ZXJzaW9uLiBZb3UgbmVlZCB0byBzZXQgZWl0aGVyIGBjb21waWxlclBhdGhgIG9yIGBjb21waWxlcmAuXG4gIGNvbXBpbGVyPzogRW1iZXJUZW1wbGF0ZUNvbXBpbGVyO1xuXG4gIC8vIExpc3Qgb2YgY3VzdG9tIHRyYW5zZm9ybWF0aW9ucyB0byBhcHBseSB0byB0aGUgaGFuZGxlYmFycyBBU1QgYmVmb3JlXG4gIC8vIGNvbXBpbGF0aW9uLiBUaGVzZSBjYW4gYmVcbiAgLy8gICAtIHRoZSBhY3R1YWwgZnVuY3Rpb25zXG4gIC8vICAgLSByZXNvbHZhYmxlIG1vZHVsZSBuYW1lc1xuICAvLyAgIC0gcGFpcnMgb2YgW3Jlc29sdmFibGVNb2R1bGVOYW1lLCBvcHRpb25zXSwgaW4gd2hpY2ggY2FzZSB3ZSB3aWxsIGludm9rZVxuICAvLyAgICAgdGhlIGRlZmF1bHQgZXhwb3J0IG9mIHRoZSBtb2R1bGUgd2l0aCB0aGUgb3B0aW9ucyBhcyBhcmd1bWVudCwgYW5kIHRoZVxuICAvLyAgICAgYWN0dWFsIGFzdCB0cmFuc2Zvcm0gZnVuY3Rpb24gc2hvdWxkIGJlIHJldHVybmVkLlxuICB0cmFuc2Zvcm1zPzogVHJhbnNmb3JtW107XG59O1xuXG5mdW5jdGlvbiBjd2RSZXF1aXJlKG1vZHVsZU5hbWU6IHN0cmluZykge1xuICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLXZhci1yZXF1aXJlc1xuICByZXR1cm4gcmVxdWlyZShyZXF1aXJlLnJlc29sdmUobW9kdWxlTmFtZSwgeyBwYXRoczogW3Byb2Nlc3MuY3dkKCldIH0pKTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlTm9kZVNwZWNpZmljT3B0aW9ucyhvcHRzOiBPcHRpb25zKTogU2hhcmVkT3B0aW9ucyB7XG4gIGxldCBjb21waWxlcjogRW1iZXJUZW1wbGF0ZUNvbXBpbGVyO1xuICBpZiAob3B0cy5jb21waWxlclBhdGgpIHtcbiAgICBsZXQgbW9kOiBhbnkgPSBjd2RSZXF1aXJlKG9wdHMuY29tcGlsZXJQYXRoKTtcbiAgICBhc3NlcnRUZW1wbGF0ZUNvbXBpbGVyKG1vZCk7XG4gICAgY29tcGlsZXIgPSBtb2Q7XG4gIH0gZWxzZSBpZiAob3B0cy5jb21waWxlcikge1xuICAgIGFzc2VydFRlbXBsYXRlQ29tcGlsZXIob3B0cy5jb21waWxlcik7XG4gICAgY29tcGlsZXIgPSBvcHRzLmNvbXBpbGVyO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcihgbXVzdCBwcm92aWRlIGNvbXBpbGVyUGF0aCBvciBjb21waWxlcmApO1xuICB9XG5cbiAgbGV0IHRyYW5zZm9ybXMgPSBbXTtcbiAgaWYgKG9wdHMudHJhbnNmb3Jtcykge1xuICAgIHRyYW5zZm9ybXMgPSBvcHRzLnRyYW5zZm9ybXMubWFwKCh0KSA9PiB7XG4gICAgICBpZiAodHlwZW9mIHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJldHVybiBlc0NvbXBhdChjd2RSZXF1aXJlKHQpKS5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHQpICYmIHR5cGVvZiB0WzBdID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXR1cm4gZXNDb21wYXQoY3dkUmVxdWlyZSh0WzBdKSkuZGVmYXVsdC5jYWxsKHVuZGVmaW5lZCwgdFsxXSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdDtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuICByZXR1cm4geyAuLi5vcHRzLCB0cmFuc2Zvcm1zLCBjb21waWxlciB9O1xufVxuXG5jb25zdCBodG1sYmFyc0lubGluZVByZWNvbXBpbGUgPSBtYWtlUGx1Z2luKGhhbmRsZU5vZGVTcGVjaWZpY09wdGlvbnMpO1xuXG4oaHRtbGJhcnNJbmxpbmVQcmVjb21waWxlIGFzIGFueSkuX3BhcmFsbGVsQmFiZWwgPSB7XG4gIHJlcXVpcmVGaWxlOiBfX2ZpbGVuYW1lLFxufTtcblxuKGh0bWxiYXJzSW5saW5lUHJlY29tcGlsZSBhcyBhbnkpLmJhc2VEaXIgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiByZXNvbHZlKF9fZGlybmFtZSwgJy4uJyk7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBodG1sYmFyc0lubGluZVByZWNvbXBpbGUgYXMgdHlwZW9mIGh0bWxiYXJzSW5saW5lUHJlY29tcGlsZSAmIHtcbiAgYmFzZURpcigpOiBzdHJpbmc7XG4gIF9wYXJhbGxlbEJhYmVsOiB7IHJlcXVpcmVGaWxlOiBzdHJpbmcgfTtcbn07XG5cbmZ1bmN0aW9uIGVzQ29tcGF0KG06IFJlY29yZDxzdHJpbmcsIGFueT4pIHtcbiAgcmV0dXJuIG0/Ll9fZXNNb2R1bGUgPyBtIDogeyBkZWZhdWx0OiBtIH07XG59XG4iXX0=