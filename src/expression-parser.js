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
        return objExpression.properties.map((prop) => {
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
            return propName;
        });
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
                result.locals = this.parseScope(invokedName, property);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhwcmVzc2lvbi1wYXJzZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJleHByZXNzaW9uLXBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFJQSxNQUFhLGdCQUFnQjtJQUMzQixZQUFvQixLQUFtQjtRQUFuQixVQUFLLEdBQUwsS0FBSyxDQUFjO0lBQUcsQ0FBQztJQUUzQyxlQUFlLENBQUMsV0FBbUIsRUFBRSxJQUE0QjtRQUMvRCxRQUFRLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFO1lBQ3RCLEtBQUssa0JBQWtCO2dCQUNyQixPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxXQUFXLEVBQUUsSUFBb0MsQ0FBQyxDQUFDO1lBQ3ZGLEtBQUssaUJBQWlCLENBQUMsQ0FBQztnQkFDdEIsT0FBTyxJQUFJLENBQUMsb0JBQW9CLENBQUMsV0FBVyxFQUFFLElBQW1DLENBQUMsQ0FBQzthQUNwRjtZQUNELEtBQUssZUFBZSxDQUFDO1lBQ3JCLEtBQUssZ0JBQWdCLENBQUM7WUFDdEIsS0FBSyxnQkFBZ0I7Z0JBQ25CLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDekI7Z0JBQ0UsTUFBTSxJQUFJLENBQUMsbUJBQW1CLENBQzVCLEdBQUcsV0FBVyxrREFBa0QsSUFBSSxDQUFDLFNBQVMsQ0FDNUUsSUFBSSxDQUFDLElBQUksQ0FDVixFQUFFLENBQ0osQ0FBQztTQUNMO0lBQ0gsQ0FBQztJQUVELG9CQUFvQixDQUFDLFdBQW1CLEVBQUUsSUFBaUM7UUFDekUsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxFQUFFO1lBQzFDLElBQUksT0FBTyxDQUFDLGVBQWUsRUFBRSxFQUFFO2dCQUM3QixNQUFNLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxvQ0FBb0MsQ0FBQyxDQUFDO2FBQ3pFO2lCQUFNLElBQUksT0FBTyxDQUFDLFlBQVksRUFB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LEtBQUssT0FBTyxFQUFFO2dCQUNoRCxNQUFNLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLFFBQWlDLENBQUMsQ0FBQzthQUNqRjtpQkFBTTtnQkFDTCxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUMvQixNQUFNLFFBQVEsQ0FBQyxtQkFBbUIsQ0FDaEMsR0FBRyxXQUFXLGlDQUFpQyxZQUFZLEVBQUUsQ0FDOUQsQ0FBQztpQkFDSDtnQkFDRCxJQUFJLFNBQVMsR0FBSSxRQUFrQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDakUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLEVBQUUsRUFBRTtvQkFDN0IsTUFBTSxTQUFTLENBQUMsbUJBQW1CLENBQUMsdUJBQXVCLENBQUMsQ0FBQztpQkFDOUQ7Z0JBQ0QsTUFBTSxDQUFDLFlBQVksQ0FBQyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDO2FBQ3JFO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxPQUFPLE1BQU0sQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBWSxDQUFDO1FBQ1gsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztJQUMxQixDQUFDO0NBQ0Y7QUF4SkQsNENBd0pDO0FBRUQsU0FBUyxJQUFJLENBQUMsSUFBb0M7SUFDaEQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRTtRQUNqQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUM7S0FDbkI7U0FBTTtRQUNMLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQztLQUNsQjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IE5vZGVQYXRoIH0gZnJvbSAnQGJhYmVsL3RyYXZlcnNlJztcbmltcG9ydCB0eXBlICogYXMgQmFiZWwgZnJvbSAnQGJhYmVsL2NvcmUnO1xuaW1wb3J0IHR5cGUgeyB0eXBlcyBhcyB0IH0gZnJvbSAnQGJhYmVsL2NvcmUnO1xuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvblBhcnNlciB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgYmFiZWw6IHR5cGVvZiBCYWJlbCkge31cblxuICBwYXJzZUV4cHJlc3Npb24oaW52b2tlZE5hbWU6IHN0cmluZywgcGF0aDogTm9kZVBhdGg8dC5FeHByZXNzaW9uPik6IHVua25vd24ge1xuICAgIHN3aXRjaCAocGF0aC5ub2RlLnR5cGUpIHtcbiAgICAgIGNhc2UgJ09iamVjdEV4cHJlc3Npb24nOlxuICAgICAgICByZXR1cm4gdGhpcy5wYXJzZU9iamVjdEV4cHJlc3Npb24oaW52b2tlZE5hbWUsIHBhdGggYXMgTm9kZVBhdGg8dC5PYmplY3RFeHByZXNzaW9uPik7XG4gICAgICBjYXNlICdBcnJheUV4cHJlc3Npb24nOiB7XG4gICAgICAgIHJldHVybiB0aGlzLnBhcnNlQXJyYXlFeHByZXNzaW9uKGludm9rZWROYW1lLCBwYXRoIGFzIE5vZGVQYXRoPHQuQXJyYXlFeHByZXNzaW9uPik7XG4gICAgICB9XG4gICAgICBjYXNlICdTdHJpbmdMaXRlcmFsJzpcbiAgICAgIGNhc2UgJ0Jvb2xlYW5MaXRlcmFsJzpcbiAgICAgIGNhc2UgJ051bWVyaWNMaXRlcmFsJzpcbiAgICAgICAgcmV0dXJuIHBhdGgubm9kZS52YWx1ZTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IHBhdGguYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICBgJHtpbnZva2VkTmFtZX0gY2FuIG9ubHkgYWNjZXB0IHN0YXRpYyBvcHRpb25zIGJ1dCB5b3UgcGFzc2VkICR7SlNPTi5zdHJpbmdpZnkoXG4gICAgICAgICAgICBwYXRoLm5vZGVcbiAgICAgICAgICApfWBcbiAgICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBwYXJzZUFycmF5RXhwcmVzc2lvbihpbnZva2VkTmFtZTogc3RyaW5nLCBwYXRoOiBOb2RlUGF0aDx0LkFycmF5RXhwcmVzc2lvbj4pIHtcbiAgICByZXR1cm4gcGF0aC5nZXQoJ2VsZW1lbnRzJykubWFwKChlbGVtZW50KSA9PiB7XG4gICAgICBpZiAoZWxlbWVudC5pc1NwcmVhZEVsZW1lbnQoKSkge1xuICAgICAgICB0aHJvdyBlbGVtZW50LmJ1aWxkQ29kZUZyYW1lRXJyb3IoYHNwcmVhZCBlbGVtZW50IGlzIG5vdCBhbGxvd2VkIGhlcmVgKTtcbiAgICAgIH0gZWxzZSBpZiAoZWxlbWVudC5pc0V4cHJlc3Npb24oKSkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJzZUV4cHJlc3Npb24oaW52b2tlZE5hbWUsIGVsZW1lbnQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcGFyc2VTY29wZShpbnZva2VkTmFtZTogc3RyaW5nLCBwYXRoOiBOb2RlUGF0aDx0Lk9iamVjdFByb3BlcnR5IHwgdC5PYmplY3RNZXRob2Q+KSB7XG4gICAgbGV0IGJvZHk6IHQuQmxvY2tTdGF0ZW1lbnQgfCB0LkV4cHJlc3Npb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cbiAgICBpZiAocGF0aC5ub2RlLnR5cGUgPT09ICdPYmplY3RNZXRob2QnKSB7XG4gICAgICBib2R5ID0gcGF0aC5ub2RlLmJvZHk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxldCB7IHZhbHVlIH0gPSBwYXRoLm5vZGU7XG4gICAgICBpZiAodGhpcy50LmlzT2JqZWN0RXhwcmVzc2lvbih2YWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgIGBQYXNzaW5nIGFuIG9iamVjdCBhcyB0aGUgXFxgc2NvcGVcXGAgcHJvcGVydHkgdG8gaW5saW5lIHRlbXBsYXRlcyBpcyBubyBsb25nZXIgc3VwcG9ydGVkLiBQbGVhc2UgcGFzcyBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBvYmplY3QgZXhwcmVzc2lvbiBpbnN0ZWFkLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpIHx8IHRoaXMudC5pc0Fycm93RnVuY3Rpb25FeHByZXNzaW9uKHZhbHVlKSkge1xuICAgICAgICBib2R5ID0gdmFsdWUuYm9keTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBsZXQgb2JqRXhwcmVzc2lvbjogdC5FeHByZXNzaW9uIHwgdW5kZWZpbmVkIHwgbnVsbCA9IHVuZGVmaW5lZDtcblxuICAgIGlmIChib2R5Py50eXBlID09PSAnT2JqZWN0RXhwcmVzc2lvbicpIHtcbiAgICAgIG9iakV4cHJlc3Npb24gPSBib2R5O1xuICAgIH0gZWxzZSBpZiAoYm9keT8udHlwZSA9PT0gJ0Jsb2NrU3RhdGVtZW50Jykge1xuICAgICAgLy8gU0FGRVRZOiBXZSBrbm93IHRoYXQgdGhlIGJvZHkgaXMgYSBSZXR1cm5TdGF0ZW1lbnQgYmVjYXVzZSB3ZSdyZSBjaGVja2luZyBpbnNpZGVcbiAgICAgIGxldCByZXR1cm5TdGF0ZW1lbnRzID0gYm9keS5ib2R5LmZpbHRlcihcbiAgICAgICAgKHN0YXRlbWVudCkgPT4gc3RhdGVtZW50LnR5cGUgPT09ICdSZXR1cm5TdGF0ZW1lbnQnXG4gICAgICApIGFzIEJhYmVsLnR5cGVzLlJldHVyblN0YXRlbWVudFtdO1xuXG4gICAgICBpZiAocmV0dXJuU3RhdGVtZW50cy5sZW5ndGggIT09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdTY29wZSBmdW5jdGlvbnMgbXVzdCBoYXZlIGEgc2luZ2xlIHJldHVybiBzdGF0ZW1lbnQgd2hpY2ggcmV0dXJucyBhbiBvYmplY3QgZXhwcmVzc2lvbiBjb250YWluaW5nIHJlZmVyZW5jZXMgdG8gaW4tc2NvcGUgdmFsdWVzJ1xuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBvYmpFeHByZXNzaW9uID0gcmV0dXJuU3RhdGVtZW50c1swXS5hcmd1bWVudDtcbiAgICB9XG5cbiAgICBpZiAob2JqRXhwcmVzc2lvbj8udHlwZSAhPT0gJ09iamVjdEV4cHJlc3Npb24nKSB7XG4gICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgIGBTY29wZSBvYmplY3RzIGZvciBcXGAke2ludm9rZWROYW1lfVxcYCBtdXN0IGJlIGFuIG9iamVjdCBleHByZXNzaW9uIGNvbnRhaW5pbmcgb25seSByZWZlcmVuY2VzIHRvIGluLXNjb3BlIHZhbHVlcywgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gb2JqZWN0IGV4cHJlc3Npb24gY29udGFpbmluZyBvbmx5IHJlZmVyZW5jZXMgdG8gaW4tc2NvcGUgdmFsdWVzYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gb2JqRXhwcmVzc2lvbi5wcm9wZXJ0aWVzLm1hcCgocHJvcCkgPT4ge1xuICAgICAgaWYgKHRoaXMudC5pc1NwcmVhZEVsZW1lbnQocHJvcCkpIHtcbiAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgIGBTY29wZSBvYmplY3RzIGZvciBcXGAke2ludm9rZWROYW1lfVxcYCBtYXkgbm90IGNvbnRhaW4gc3ByZWFkIGVsZW1lbnRzYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHRoaXMudC5pc09iamVjdE1ldGhvZChwcm9wKSkge1xuICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgYFNjb3BlIG9iamVjdHMgZm9yIFxcYCR7aW52b2tlZE5hbWV9XFxgIG1heSBub3QgY29udGFpbiBtZXRob2RzYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBsZXQgeyBrZXksIHZhbHVlIH0gPSBwcm9wO1xuICAgICAgaWYgKCF0aGlzLnQuaXNTdHJpbmdMaXRlcmFsKGtleSkgJiYgIXRoaXMudC5pc0lkZW50aWZpZXIoa2V5KSkge1xuICAgICAgICB0aHJvdyBwYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoXG4gICAgICAgICAgYFNjb3BlIG9iamVjdHMgZm9yIFxcYCR7aW52b2tlZE5hbWV9XFxgIG1heSBvbmx5IGNvbnRhaW4gc3RhdGljIHByb3BlcnR5IG5hbWVzYFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBsZXQgcHJvcE5hbWUgPSBuYW1lKGtleSk7XG5cbiAgICAgIGlmICh2YWx1ZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHtcbiAgICAgICAgdGhyb3cgcGF0aC5idWlsZENvZGVGcmFtZUVycm9yKFxuICAgICAgICAgIGBTY29wZSBvYmplY3RzIGZvciBcXGAke2ludm9rZWROYW1lfVxcYCBtYXkgb25seSBjb250YWluIGRpcmVjdCByZWZlcmVuY2VzIHRvIGluLXNjb3BlIHZhbHVlcywgZS5nLiB7ICR7cHJvcE5hbWV9IH0gb3IgeyAke3Byb3BOYW1lfTogJHtwcm9wTmFtZX0gfWBcbiAgICAgICAgKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHByb3BOYW1lO1xuICAgIH0pO1xuICB9XG5cbiAgcGFyc2VPYmplY3RFeHByZXNzaW9uKFxuICAgIGludm9rZWROYW1lOiBzdHJpbmcsXG4gICAgcGF0aDogTm9kZVBhdGg8dC5PYmplY3RFeHByZXNzaW9uPixcbiAgICBzaG91bGRQYXJzZVNjb3BlID0gZmFsc2VcbiAgKSB7XG4gICAgbGV0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblxuICAgIHBhdGguZ2V0KCdwcm9wZXJ0aWVzJykuZm9yRWFjaCgocHJvcGVydHkpID0+IHtcbiAgICAgIGxldCB7IG5vZGUgfSA9IHByb3BlcnR5O1xuICAgICAgaWYgKHRoaXMudC5pc1NwcmVhZEVsZW1lbnQobm9kZSkpIHtcbiAgICAgICAgdGhyb3cgcHJvcGVydHkuYnVpbGRDb2RlRnJhbWVFcnJvcihgJHtpbnZva2VkTmFtZX0gZG9lcyBub3QgYWxsb3cgc3ByZWFkIGVsZW1lbnRgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG5vZGUuY29tcHV0ZWQpIHtcbiAgICAgICAgdGhyb3cgcHJvcGVydHkuYnVpbGRDb2RlRnJhbWVFcnJvcihgJHtpbnZva2VkTmFtZX0gY2FuIG9ubHkgYWNjZXB0IHN0YXRpYyBwcm9wZXJ0eSBuYW1lc2ApO1xuICAgICAgfVxuXG4gICAgICBsZXQgeyBrZXkgfSA9IG5vZGU7XG4gICAgICBpZiAoIXRoaXMudC5pc0lkZW50aWZpZXIoa2V5KSAmJiAhdGhpcy50LmlzU3RyaW5nTGl0ZXJhbChrZXkpKSB7XG4gICAgICAgIHRocm93IHByb3BlcnR5LmJ1aWxkQ29kZUZyYW1lRXJyb3IoYCR7aW52b2tlZE5hbWV9IGNhbiBvbmx5IGFjY2VwdCBzdGF0aWMgcHJvcGVydHkgbmFtZXNgKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHByb3BlcnR5TmFtZSA9IG5hbWUoa2V5KTtcblxuICAgICAgaWYgKHNob3VsZFBhcnNlU2NvcGUgJiYgcHJvcGVydHlOYW1lID09PSAnc2NvcGUnKSB7XG4gICAgICAgIHJlc3VsdC5sb2NhbHMgPSB0aGlzLnBhcnNlU2NvcGUoaW52b2tlZE5hbWUsIHByb3BlcnR5IGFzIE5vZGVQYXRoPHR5cGVvZiBub2RlPik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodGhpcy50LmlzT2JqZWN0TWV0aG9kKG5vZGUpKSB7XG4gICAgICAgICAgdGhyb3cgcHJvcGVydHkuYnVpbGRDb2RlRnJhbWVFcnJvcihcbiAgICAgICAgICAgIGAke2ludm9rZWROYW1lfSBkb2VzIG5vdCBhY2NlcHQgYSBtZXRob2QgZm9yICR7cHJvcGVydHlOYW1lfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIGxldCB2YWx1ZVBhdGggPSAocHJvcGVydHkgYXMgTm9kZVBhdGg8dHlwZW9mIG5vZGU+KS5nZXQoJ3ZhbHVlJyk7XG4gICAgICAgIGlmICghdmFsdWVQYXRoLmlzRXhwcmVzc2lvbigpKSB7XG4gICAgICAgICAgdGhyb3cgdmFsdWVQYXRoLmJ1aWxkQ29kZUZyYW1lRXJyb3IoYG11c3QgYmUgYW4gZXhwcmVzc2lvbmApO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdFtwcm9wZXJ0eU5hbWVdID0gdGhpcy5wYXJzZUV4cHJlc3Npb24oaW52b2tlZE5hbWUsIHZhbHVlUGF0aCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcHJpdmF0ZSBnZXQgdCgpIHtcbiAgICByZXR1cm4gdGhpcy5iYWJlbC50eXBlcztcbiAgfVxufVxuXG5mdW5jdGlvbiBuYW1lKG5vZGU6IHQuU3RyaW5nTGl0ZXJhbCB8IHQuSWRlbnRpZmllcik6IHN0cmluZyB7XG4gIGlmIChub2RlLnR5cGUgPT09ICdTdHJpbmdMaXRlcmFsJykge1xuICAgIHJldHVybiBub2RlLnZhbHVlO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBub2RlLm5hbWU7XG4gIH1cbn1cbiJdfQ==