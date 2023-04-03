"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpressionParser = void 0;
class ExpressionParser {
    constructor(babel) {
        this.babel = babel;
    }
    parseExpression(invokedName, path) {
        switch (path.node.type) {
            case 'ObjectExpression':
                return this.parseObjectExpression(invokedName, path);
            case 'ArrayExpression': {
                return this.parseArrayExpression(invokedName, path);
            }
            case 'StringLiteral':
            case 'BooleanLiteral':
            case 'NumericLiteral':
                return path.node.value;
            default:
                throw path.buildCodeFrameError(`${invokedName} can only accept static options but you passed ${JSON.stringify(path.node)}`);
        }
    }
    parseArrayExpression(invokedName, path) {
        return path.get('elements').map((element) => {
            if (element.isSpreadElement()) {
                throw element.buildCodeFrameError(`spread element is not allowed here`);
            }
            else if (element.isExpression()) {
                return this.parseExpression(invokedName, element);
            }
        });
    }
    parseScope(invokedName, path) {
        let body = undefined;
        if (path.node.type === 'ObjectMethod') {
            body = path.node.body;
        }
        else {
            let { value } = path.node;
            if (this.t.isObjectExpression(value)) {
                throw path.buildCodeFrameError(`Passing an object as the \`scope\` property to inline templates is no longer supported. Please pass a function that returns an object expression instead.`);
            }
            if (this.t.isFunctionExpression(value) || this.t.isArrowFunctionExpression(value)) {
                body = value.body;
            }
        }
        let objExpression = undefined;
        if ((body === null || body === void 0 ? void 0 : body.type) === 'ObjectExpression') {
            objExpression = body;
        }
        else if ((body === null || body === void 0 ? void 0 : body.type) === 'BlockStatement') {
            // SAFETY: We know that the body is a ReturnStatement because we're checking inside
            let returnStatements = body.body.filter((statement) => statement.type === 'ReturnStatement');
            if (returnStatements.length !== 1) {
                throw new Error('Scope functions must have a single return statement which returns an object expression containing references to in-scope values');
            }
            objExpression = returnStatements[0].argument;
        }
        if ((objExpression === null || objExpression === void 0 ? void 0 : objExpression.type) !== 'ObjectExpression') {
            throw path.buildCodeFrameError(`Scope objects for \`${invokedName}\` must be an object expression containing only references to in-scope values, or a function that returns an object expression containing only references to in-scope values`);
        }
        return objExpression.properties.reduce((res, prop) => {
            if (this.t.isSpreadElement(prop)) {
                throw path.buildCodeFrameError(`Scope objects for \`${invokedName}\` may not contain spread elements`);
            }
            if (this.t.isObjectMethod(prop)) {
                throw path.buildCodeFrameError(`Scope objects for \`${invokedName}\` may not contain methods`);
            }
            let { key, value } = prop;
            if (!this.t.isStringLiteral(key) && !this.t.isIdentifier(key)) {
                throw path.buildCodeFrameError(`Scope objects for \`${invokedName}\` may only contain static property names`);
            }
            let propName = name(key);
            if (value.type !== 'Identifier') {
                throw path.buildCodeFrameError(`Scope objects for \`${invokedName}\` may only contain direct references to in-scope values, e.g. { ${propName} } or { ${propName}: ${propName} }`);
            }
            res[propName] = value.name;
            return res;
        }, {});
    }
    parseObjectExpression(invokedName, path, shouldParseScope = false) {
        let result = {};
        path.get('properties').forEach((property) => {
            let { node } = property;
            if (this.t.isSpreadElement(node)) {
                throw property.buildCodeFrameError(`${invokedName} does not allow spread element`);
            }
            if (node.computed) {
                throw property.buildCodeFrameError(`${invokedName} can only accept static property names`);
            }
            let { key } = node;
            if (!this.t.isIdentifier(key) && !this.t.isStringLiteral(key)) {
                throw property.buildCodeFrameError(`${invokedName} can only accept static property names`);
            }
            let propertyName = name(key);
            if (shouldParseScope && propertyName === 'scope') {
                const scope = this.parseScope(invokedName, property);
                result.locals = Object.keys(scope);
                result.localsWithNames = scope;
            }
            else {
                if (this.t.isObjectMethod(node)) {
                    throw property.buildCodeFrameError(`${invokedName} does not accept a method for ${propertyName}`);
                }
                let valuePath = property.get('value');
                if (!valuePath.isExpression()) {
                    throw valuePath.buildCodeFrameError(`must be an expression`);
                }
                result[propertyName] = this.parseExpression(invokedName, valuePath);
            }
        });
        return result;
    }
    get t() {
        return this.babel.types;
    }
}
exports.ExpressionParser = ExpressionParser;
function name(node) {
    if (node.type === 'StringLiteral') {
        return node.value;
    }
    else {
        return node.name;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJleHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSxNQUFhLGdCQUFnQjtJQUMzQixZQUFvQixLQUFtQjtRQUFuQixVQUFLLEdBQUwsS0FBSyxDQUFjO0lBQUcsQ0FBQztJQUUzQyxlQUFlLENBQUMsV0FBbUIsRUFBRSxJQUE0QjtRQUMvRCxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO1lBQ3RCLEtBQUssa0JBQWtCO2dCQUNyQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEVBQUUsSUFBb0MsQ0FBQyxDQUFDO1lBQ3ZGLEtBQUssaUJBQWlCLENBQUMsQ0FBQztnQkFDdEIsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxFQUFFLElBQW1DLENBQUMsQ0FBQzthQUNwRjtZQUNELEtBQUssZUFBZSxDQUFDO1lBQ3JCLEtBQUssZ0JBQWdCLENBQUM7WUFDdEIsS0FBSyxnQkFBZ0I7Z0JBQ25CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDekI7Z0JBQ0UsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQzVCLEdBQUcsV0FBVyxrREFBa0QsSUFBSSxDQUFDLFNBQVMsQ0FDNUUsSUFBSSxDQUFDLElBQUksQ0FDVixFQUFFLENBQ0osQ0FBQztTQUNMO0lBQ0gsQ0FBQztJQUVELG9CQUFvQixDQUFDLFdBQW1CLEVBQUUsSUFBaUM7UUFDekUsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzFDLElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFO2dCQUM3QixNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2FBQ3pFO2lCQUFNLElBQUksT0FBTyxDQUFDLFlBQVksRUFB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Q0FBQyxJQUFJLENBQUM7S0FDbEI7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBOb2RlUGF0aCB9IGZyb20gJ0BiYWJlbC90cmF2ZXJzZSc7XG5pbXBvcnQgdHlwZSAqIGFzIEJhYmVsIGZyb20gJ0BiYWJlbC9jb3JlJztcbmltcG9ydCB0eXBlIHsgdHlwZXMgYXMgdCB9IGZyb20gJ0BiYWJlbC9jb3JlJztcblxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25QYXJzZXIge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIGJhYmVsOiB0eXBlb2YgQmFiZWwpIHt9XG5cbiAgcGFyc2VFeHByZXNzaW9uKGludm9rZWROYW1lOiBzdHJpbmcsIHBhdGg6IE5vZGVQYXRoPHQuRXhwcmVzc2lvbj4pOiB1bmtub3duIHtcbiAgICBzd2l0Y2ggKHBhdGgubm9kZS50eXBlKSB7XG4gICAgICBjYXNlICdPYmplY3RFeHByZXNzaW9uJzpcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VPYmplY3RFeHByZXNzaW9uKGludm9rZWROYW1lLCBwYXRoIGFzIE5vZGVQYXRoPHQuT2JqZWN0RXhwcmVzc2lvbj4pO1xuICAgICAgY2FzZSAnQXJyYXlFeHByZXNzaW9uJzoge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJzZUFycmF5RXhwcmVzc2lvbihpbnZva2VkTmFtZSwgcGF0aCBhcyBOb2RlUGF0aDx0LkFycmF5RXhwcmVzc2lvbj4pO1xuICAgICAgfVxuICAgICAgY2FzZSAnU3RyaW5nTGl0ZXJhbCc6XG4gICAgICBjYXNlICdCb29sZWFuTGl0ZXJhbCc6XG4gICAgICBjYXNlICdOdW1lcmljTGl0ZXJhbCc6XG4gICAgICAgIHJldHVybiBwYXRoLm5vZGUudmFsdWU7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgYCR7aW52b2tlZE5hbWV9IGNhbiBvbmx5IGFjY2VwdCBzdGF0aWMgb3B0aW9ucyBidXQgeW91IHBhc3NlZCAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgICAgcGF0aC5ub2RlXG4gICAgICAgICAgKX1gXG4gICAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgcGFyc2VBcnJheUV4cHJlc3Npb24oaW52b2tlZE5hbWU6IHN0cmluZywgcGF0aDogTm9kZVBhdGg8dC5BcnJheUV4cHJlc3Npb24+KSB7XG4gICAgcmV0dXJuIHBhdGguZ2V0KCdlbGVtZW50cycpLm1hcCgoZWxlbWVudCkgPT4ge1xuICAgICAgaWYgKGVsZW1lbnQuaXNTcHJlYWRFbGVtZW50KCkpIHtcbiAgICAgICAgdGhyb3cgZWxlbWVudC5idWlsZENvZGVGcmFtZUVycm9yKGBzcHJlYWQgZWxlbWVudCBpcyBub3QgYWxsb3dlZCBoZXJlYCk7XG4gICAgICB9IGVsc2UgaWYgKGVsZW1lbnQuaXNFeHByZXNzaW9uKCkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyc2VFeHByZXNzaW9uKGludm9rZWROYW1lLCBlbGVtZW50KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHBhcnNlU2NvcGUoaW52b2tlZE5hbWU6IHN0cmluZywgcGF0aDogTm9kZVBhdGg8dC5PYmplY3RQcm9wZXJ0eSB8IHQuT2JqZWN0TWV0aG9kPikge1xuICAgIGxldCBib2R5OiB0LkJsb2NrU3RhdGVtZW50IHwgdC5FeHByZXNzaW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG4gICAgaWYgKHBhdGgubm9kZS50eXBlID09PSAnT2JqZWN0TWV0aG9kJykge1xuICAgICAgYm9keSA9IHBhdGgubm9kZS5ib2R5O1xuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgeyB2YWx1ZSB9ID0gcGF0aC5ub2RlO1xuICAgICAgaWYgKHRoaXMudC5pc09iamVjdEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgIHRocm93IHBhdGguYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICBgUGFzc2luZyBhbiBvYmplY3QgYXMgdGhlIFxcYHNjb3BlXFxgIHByb3BlcnR5IHRvIGlubGluZSB0ZW1wbGF0ZXMgaXMgbm8gbG9uZ2VyIHN1cHBvcnRlZC4gUGxlYXNlIHBhc3MgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gb2JqZWN0IGV4cHJlc3Npb24gaW5zdGVhZC5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAodGhpcy50LmlzRnVuY3Rpb25FeHByZXNzaW9uKHZhbHVlKSB8fCB0aGlzLnQuaXNBcnJvd0Z1bmN0aW9uRXhwcmVzc2lvbih2YWx1ZSkpIHtcbiAgICAgICAgYm9keSA9IHZhbHVlLmJvZHk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgbGV0IG9iakV4cHJlc3Npb246IHQuRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB8IG51bGwgPSB1bmRlZmluZWQ7XG5cbiAgICBpZiAoYm9keT8udHlwZSA9PT0gJ09iamVjdEV4cHJlc3Npb24nKSB7XG4gICAgICBvYmpFeHByZXNzaW9uID0gYm9keTtcbiAgICB9IGVsc2UgaWYgKGJvZHk/LnR5cGUgPT09ICdCbG9ja1N0YXRlbWVudCcpIHtcbiAgICAgIC8vIFNBRkVUWTogV2Uga25vdyB0aGF0IHRoZSBib2R5IGlzIGEgUmV0dXJuU3RhdGVtZW50IGJlY2F1c2Ugd2UncmUgY2hlY2tpbmcgaW5zaWRlXG4gICAgICBsZXQgcmV0dXJuU3RhdGVtZW50cyA9IGJvZHkuYm9keS5maWx0ZXIoXG4gICAgICAgIChzdGF0ZW1lbnQpID0+IHN0YXRlbWVudC50eXBlID09PSAnUmV0dXJuU3RhdGVtZW50J1xuICAgICAgKSBhcyBCYWJlbC50eXBlcy5SZXR1cm5TdGF0ZW1lbnRbXTtcblxuICAgICAgaWYgKHJldHVyblN0YXRlbWVudHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAnU2NvcGUgZnVuY3Rpb25zIG11c3QgaGF2ZSBhIHNpbmdsZSByZXR1cm4gc3RhdGVtZW50IHdoaWNoIHJldHVybnMgYW4gb2JqZWN0IGV4cHJlc3Npb24gY29udGFpbmluZyByZWZlcmVuY2VzIHRvIGluLXNjb3BlIHZhbHVlcydcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgb2JqRXhwcmVzc2lvbiA9IHJldHVyblN0YXRlbWVudHNbMF0uYXJndW1lbnQ7XG4gICAgfVxuXG4gICAgaWYgKG9iakV4cHJlc3Npb24/LnR5cGUgIT09ICdPYmplY3RFeHByZXNzaW9uJykge1xuICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICBgU2NvcGUgb2JqZWN0cyBmb3IgXFxgJHtpbnZva2VkTmFtZX1cXGAgbXVzdCBiZSBhbiBvYmplY3QgZXhwcmVzc2lvbiBjb250YWluaW5nIG9ubHkgcmVmZXJlbmNlcyB0byBpbi1zY29wZSB2YWx1ZXMsIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIG9iamVjdCBleHByZXNzaW9uIGNvbnRhaW5pbmcgb25seSByZWZlcmVuY2VzIHRvIGluLXNjb3BlIHZhbHVlc2BcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG9iakV4cHJlc3Npb24ucHJvcGVydGllcy5yZWR1Y2UoKHJlcywgcHJvcCkgPT4ge1xuICAgICAgaWYgKHRoaXMudC5pc1NwcmVhZEVsZW1lbnQocHJvcCkpIHtcbiAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgIGBTY29wZSBvYmplY3RzIGZvciBcXGAke2ludm9rZWROYW1lfVxcYCBtYXkgbm90IGNvbnRhaW4gc3ByZWFkIGVsZW1lbnRzYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudC5pc09iamVjdE1ldGhvZChwcm9wKSkge1xuICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgYFNjb3BlIG9iamVjdHMgZm9yIFxcYCR7aW52b2tlZE5hbWV9XFxgIG1heSBub3QgY29udGFpbiBtZXRob2RzYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBsZXQgeyBrZXksIHZhbHVlIH0gPSBwcm9wO1xuICAgICAgaWYgKCF0aGlzLnQuaXNTdHJpbmdMaXRlcmFsKGtleSkgJiYgIXRoaXMudC5pc0lkZW50aWZpZXIoa2V5KSkge1xuICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgYFNjb3BlIG9iamVjdHMgZm9yIFxcYCR7aW52b2tlZE5hbWV9XFxgIG1heSBvbmx5IGNvbnRhaW4gc3RhdGljIHByb3BlcnR5IG5hbWVzYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBsZXQgcHJvcE5hbWUgPSBuYW1lKGtleSk7XG5cbiAgICAgIGlmICh2YWx1ZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHtcbiAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgIGBTY29wZSBvYmplY3RzIGZvciBcXGAke2ludm9rZWROYW1lfVxcYCBtYXkgb25seSBjb250YWluIGRpcmVjdCByZWZlcmVuY2VzIHRvIGluLXNjb3BlIHZhbHVlcywgZS5nLiB7ICR7cHJvcE5hbWV9IH0gb3IgeyAke3Byb3BOYW1lfTogJHtwcm9wTmFtZX0gfWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmVzW3Byb3BOYW1lXSA9IHZhbHVlLm5hbWU7XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH0sIDx7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9Pnt9KTtcbiAgfVxuXG4gIHBhcnNlT2JqZWN0RXhwcmVzc2lvbihcbiAgICBpbnZva2VkTmFtZTogc3RyaW5nLFxuICAgIHBhdGg6IE5vZGVQYXRoPHQuT2JqZWN0RXhwcmVzc2lvbj4sXG4gICAgc2hvdWxkUGFyc2VTY29wZSA9IGZhbHNlXG4gICkge1xuICAgIGxldCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cbiAgICBwYXRoLmdldCgncHJvcGVydGllcycpLmZvckVhY2goKHByb3BlcnR5KSA9PiB7XG4gICAgICBsZXQgeyBub2RlIH0gPSBwcm9wZXJ0eTtcbiAgICAgIGlmICh0aGlzLnQuaXNTcHJlYWRFbGVtZW50KG5vZGUpKSB7XG4gICAgICAgIHRocm93IHByb3BlcnR5LmJ1aWxkQ29kZUZyYW1lRXJyb3IoYCR7aW52b2tlZE5hbWV9IGRvZXMgbm90IGFsbG93IHNwcmVhZCBlbGVtZW50YCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChub2RlLmNvbXB1dGVkKSB7XG4gICAgICAgIHRocm93IHByb3BlcnR5LmJ1aWxkQ29kZUZyYW1lRXJyb3IoYCR7aW52b2tlZE5hbWV9IGNhbiBvbmx5IGFjY2VwdCBzdGF0aWMgcHJvcGVydHkgbmFtZXNgKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHsga2V5IH0gPSBub2RlO1xuICAgICAgaWYgKCF0aGlzLnQuaXNJZGVudGlmaWVyKGtleSkgJiYgIXRoaXMudC5pc1N0cmluZ0xpdGVyYWwoa2V5KSkge1xuICAgICAgICB0aHJvdyBwcm9wZXJ0eS5idWlsZENvZGVGcmFtZUVycm9yKGAke2ludm9rZWROYW1lfSBjYW4gb25seSBhY2NlcHQgc3RhdGljIHByb3BlcnR5IG5hbWVzYCk7XG4gICAgICB9XG5cbiAgICAgIGxldCBwcm9wZXJ0eU5hbWUgPSBuYW1lKGtleSk7XG5cbiAgICAgIGlmIChzaG91bGRQYXJzZVNjb3BlICYmIHByb3BlcnR5TmFtZSA9PT0gJ3Njb3BlJykge1xuICAgICAgICBjb25zdCBzY29wZSA9IHRoaXMucGFyc2VTY29wZShpbnZva2VkTmFtZSwgcHJvcGVydHkgYXMgTm9kZVBhdGg8dHlwZW9mIG5vZGU+KTtcbiAgICAgICAgcmVzdWx0LmxvY2FscyA9IE9iamVjdC5rZXlzKHNjb3BlKTtcbiAgICAgICAgcmVzdWx0LmxvY2Fsc1dpdGhOYW1lcyA9IHNjb3BlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKHRoaXMudC5pc09iamVjdE1ldGhvZChub2RlKSkge1xuICAgICAgICAgIHRocm93IHByb3BlcnR5LmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgICBgJHtpbnZva2VkTmFtZX0gZG9lcyBub3QgYWNjZXB0IGEgbWV0aG9kIGZvciAke3Byb3BlcnR5TmFtZX1gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdmFsdWVQYXRoID0gKHByb3BlcnR5IGFzIE5vZGVQYXRoPHR5cGVvZiBub2RlPikuZ2V0KCd2YWx1ZScpO1xuICAgICAgICBpZiAoIXZhbHVlUGF0aC5pc0V4cHJlc3Npb24oKSkge1xuICAgICAgICAgIHRocm93IHZhbHVlUGF0aC5idWlsZENvZGVGcmFtZUVycm9yKGBtdXN0IGJlIGFuIGV4cHJlc3Npb25gKTtcbiAgICAgICAgfVxuICAgICAgICByZXN1bHRbcHJvcGVydHlOYW1lXSA9IHRoaXMucGFyc2VFeHByZXNzaW9uKGludm9rZWROYW1lLCB2YWx1ZVBhdGgpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0IHQoKSB7XG4gICAgcmV0dXJuIHRoaXMuYmFiZWwudHlwZXM7XG4gIH1cbn1cblxuZnVuY3Rpb24gbmFtZShub2RlOiB0LlN0cmluZ0xpdGVyYWwgfCB0LklkZW50aWZpZXIpOiBzdHJpbmcge1xuICBpZiAobm9kZS50eXBlID09PSAnU3RyaW5nTGl0ZXJhbCcpIHtcbiAgICByZXR1cm4gbm9kZS52YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbm9kZS5uYW1lO1xuICB9XG59XG4iXX0=