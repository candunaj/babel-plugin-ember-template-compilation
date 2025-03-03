import path from 'path';
import * as babel from '@babel/core';
import HTMLBarsInlinePrecompile, { Options } from '..';
import TransformTemplateLiterals from '@babel/plugin-transform-template-literals';
import TransformModules from '@babel/plugin-transform-modules-amd';
import TransformUnicodeEscapes from '@babel/plugin-transform-unicode-escapes';
import { stripIndent } from 'common-tags';
import { EmberTemplateCompiler } from '../src/ember-template-compiler';
import sinon from 'sinon';
import { ExtendedPluginBuilder } from '../src/js-utils';
import 'code-equality-assertions/jest';

describe('htmlbars-inline-precompile', function () {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  let compiler: EmberTemplateCompiler = { ...require('ember-source/dist/ember-template-compiler') };
  let plugins: ([typeof HTMLBarsInlinePrecompile, Options] | [unknown])[];

  function transform(code: string) {
    let x = babel
      .transform(code, {
        filename: 'foo-bar.js',
        plugins,
      })!
      .code!.trim();
    return x;
  }

  beforeEach(function () {
    plugins = [[HTMLBarsInlinePrecompile, { compiler }]];
  });

  afterEach(function () {
    sinon.restore();
  });

  it('supports compilation that returns a non-JSON.parseable object', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `function() { return "${template}"; }`;
    });

    let transpiled = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello');"
    );

    expect(transpiled).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        hello
      */
      function () {
        return "hello";
      });
    `);
  });

  it('supports compilation with templateCompilerPath', function () {
    plugins = [[HTMLBarsInlinePrecompile, { compilerPath: require.resolve('./mock-precompile') }]];

    let transpiled = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello');"
    );

    expect(transpiled).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        hello
      */
      precompiledFromPath(hello));
    `);
  });

  it('passes options when used as a call expression', function () {
    let source = 'hello';
    let spy = sinon.spy(compiler, 'precompile');

    transform(
      `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}');`
    );

    expect(spy.firstCall.lastArg).toHaveProperty('contents', source);
  });

  it('uses the user provided isProduction option if present', function () {
    let source = 'hello';
    let spy = sinon.spy(compiler, 'precompile');

    transform(
      `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { isProduction: true });`
    );

    expect(spy.firstCall.lastArg).toHaveProperty('isProduction', true);
  });

  it('allows a template string literal when used as a call expression', function () {
    let source = 'hello';
    let spy = sinon.spy(compiler, 'precompile');

    transform(
      `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate(\`${source}\`);`
    );

    expect(spy.firstCall.lastArg).toHaveProperty('contents', source);
  });

  it('errors when the template string contains placeholders', function () {
    expect(() =>
      transform(
        "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate(`string ${value}`)"
      )
    ).toThrow(/placeholders inside a template string are not supported/);
  });

  it('errors when the template string is tagged', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['htmlbars-inline-precompile'],
        },
      ],
    ];
    expect(() =>
      transform("import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs(hbs`string`)")
    ).toThrow(/tagged template strings inside hbs are not supported/);
  });

  it('allows static userland options when used as a call expression', function () {
    let source = 'hello';
    let spy = sinon.spy(compiler, 'precompile');

    transform(
      `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { parseOptions: { srcName: 'bar.hbs' }, moduleName: 'foo/bar.hbs', xyz: 123, qux: true, stringifiedThing: ${JSON.stringify(
        { foo: 'baz' }
      )}});`
    );

    expect(spy.firstCall.lastArg).toHaveProperty('parseOptions', { srcName: 'bar.hbs' });
    expect(spy.firstCall.lastArg).toHaveProperty('moduleName', 'foo/bar.hbs');
    expect(spy.firstCall.lastArg).toHaveProperty('xyz', 123);
    expect(spy.firstCall.lastArg).toHaveProperty('qux', true);
    expect(spy.firstCall.lastArg).toHaveProperty('stringifiedThing', { foo: 'baz' });
  });

  it('adds a comment with the original template string', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      if ('foo') {
        const template = precompileTemplate('hello');
      }
    `);

    expect(transformed).toEqual(stripIndent`
      import { createTemplateFactory } from "@ember/template-factory";
      if ('foo') {
        const template = createTemplateFactory(
        /*
          hello
        */
        precompiled("hello"));
      }
    `);
  });

  it('avoids a build time error when passed `insertRuntimeErrors`', function () {
    sinon.stub(compiler, 'precompile').throws(new Error('NOOOOOOOOOOOOOOOOOOOOOO'));

    let transformed = transform(
      `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello', { insertRuntimeErrors: true });`
    );

    expect(transformed).toEqualCode(`
      var compiled = function () {
        throw new Error("NOOOOOOOOOOOOOOOOOOOOOO");
      }();
    `);
  });

  it('escapes any */ included in the template string', function () {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, enableLegacyModules: ['htmlbars-inline-precompile'] }],
    ];

    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    let transformed = transform(stripIndent`
      import hbs from 'htmlbars-inline-precompile';
      if ('foo') {
        const template = hbs\`hello */\`;
      }
    `);

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";

      if ('foo') {
        const template = createTemplateFactory(
        /*
          hello *\\/
        */
        precompiled("hello */"));
      }
    `);
  });

  it('passes options when used as a tagged template string', function () {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, enableLegacyModules: ['htmlbars-inline-precompile'] }],
    ];

    let source = 'hello';
    let spy = sinon.spy(compiler, 'precompile');

    transform(`import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs\`${source}\`;`);

    expect(spy.firstCall.lastArg).toHaveProperty('contents', source);
  });

  it("strips import statement for '@ember/template-precompilation' module", function () {
    let transformed = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\nimport Ember from 'ember';"
    );

    // strips import statement
    expect(transformed).toEqual("import Ember from 'ember';");
  });

  it('replaces tagged template expressions with precompiled version', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['htmlbars-inline-precompile'],
        },
      ],
    ];
    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
    `);
  });

  it('replaces tagged template expressions with precompiled version when ember-cli-htmlbars is enabled', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['ember-cli-htmlbars'],
        },
      ],
    ];

    let transformed = transform(
      "import { hbs as baz } from 'ember-cli-htmlbars';\nvar compiled = baz`hello`;"
    );

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
    `);
  });

  it('leaves tagged template expressions alone when ember-cli-htmlbars is disabled', function () {
    let transformed = transform(
      "import { hbs as baz } from 'ember-cli-htmlbars';\nvar compiled = baz`hello`;"
    );

    expect(transformed).toEqualCode(`
      import { hbs as baz } from 'ember-cli-htmlbars';
      var compiled = baz\`hello\`;
    `);
  });

  it('does not cause an error when no import is found', function () {
    expect(() => transform('something("whatever")')).not.toThrow();
    expect(() => transform('something`whatever`')).not.toThrow();
  });

  it('works with multiple imports', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    let transformed = transform(`
      import { precompileTemplate } from '@ember/template-compilation';
      import { precompileTemplate as other } from '@ember/template-compilation';
      let a = precompileTemplate('hello');
      let b = other('hello');
    `);

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      let a = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
      let b = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
    `);
  });

  it('does not fully remove imports that have other imports', function () {
    let transformed = transform(`
      import { precompileTemplate, compileTemplate } from '@ember/template-compilation';
    `);

    expect(transformed).toEqualCode(
      `import { compileTemplate } from '@ember/template-compilation';`
    );
  });

  it('forbids template literal usage of @ember/template-compilation', function () {
    expect(() => {
      transform(`
        import { precompileTemplate } from '@ember/template-compilation';
        let a = precompileTemplate\`hello\`;
      `);
    }).toThrow(
      /Attempted to use `precompileTemplate` as a template tag, but it can only be called as a function with a string passed to it:/
    );
  });

  it('works properly when used along with modules transform', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins.push([TransformModules]);
    let transformed = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\n" +
        "var compiled1 = precompileTemplate('hello');\n" +
        "var compiled2 = precompileTemplate('goodbye');\n"
    );

    expect(transformed).toEqualCode(`
      define(["@ember/template-factory"], function (_templateFactory) {
        "use strict";

        var compiled1 = (0, _templateFactory.createTemplateFactory)(
        /*
          hello
        */
        precompiled("hello"));
        var compiled2 = (0, _templateFactory.createTemplateFactory)(
        /*
          goodbye
        */
        precompiled("goodbye"));
      });
    `);
  });

  it('does not error when reusing a preexisting import', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    let transformed = transform(`
      import { createTemplateFactory } from '@ember/template-factory';
      import { precompileTemplate } from '@ember/template-compilation';
      precompileTemplate('hello');
      createTemplateFactory('whatever here');
    `);

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from '@ember/template-factory';
      createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
      createTemplateFactory('whatever here');
    `);
  });

  it('works properly when used after modules transform', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins.unshift([TransformModules]);
    let transformed = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello');"
    );

    expect(transformed).toEqualCode(`
      define(["@ember/template-factory", "@ember/template-compilation"], function (_templateFactory, _templateCompilation) {
        "use strict";

        var compiled = (0, _templateFactory.createTemplateFactory)(
        /*
          hello
        */
        precompiled("hello"));
      });
    `);
  });

  it('works properly when used along with @babel/plugin-transform-unicode-escapes', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins.push([TransformUnicodeEscapes]);
    let transformed = transform(
      "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('some emoji goes 💥');"
    );

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        some emoji goes 💥
      */
      precompiled("some emoji goes 💥"));
    `);
  });

  it('replaces tagged template expressions when before babel-plugin-transform-es2015-template-literals', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['htmlbars-inline-precompile'],
        },
      ],
      [TransformTemplateLiterals],
    ];

    let transformed = transform(
      "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`hello`;"
    );

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@ember/template-factory";
      var compiled = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
    `);
  });

  it("doesn't replace unrelated tagged template strings", function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['htmlbars-inline-precompile'],
        },
      ],
    ];
    let transformed = transform(
      'import hbs from "htmlbars-inline-precompile";\nvar compiled = anotherTag`hello`;'
    );

    // other tagged template strings are not touched
    expect(transformed).toEqual('var compiled = anotherTag`hello`;');
  });

  it('throws when the tagged template string contains placeholders', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          enableLegacyModules: ['htmlbars-inline-precompile'],
        },
      ],
    ];
    expect(() =>
      transform(
        "import hbs from 'htmlbars-inline-precompile';\nvar compiled = hbs`string ${value}`"
      )
    ).toThrow(/placeholders inside a tagged template string are not supported/);
  });

  it('works with glimmer modules', function () {
    sinon.replace(compiler, 'precompile', (template) => {
      return `precompiled("${template}")`;
    });

    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          outputModuleOverrides: {
            '@ember/template-factory': {
              createTemplateFactory: ['createTemplateFactory', '@glimmer/core'],
            },
          },
        },
      ],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      const template = precompileTemplate('hello');
    `);

    expect(transformed).toEqualCode(`
      import { createTemplateFactory } from "@glimmer/core";
      const template = createTemplateFactory(
      /*
        hello
      */
      precompiled("hello"));
    `);
  });

  describe('caching', function () {
    it('include `baseDir` function for caching', function () {
      expect(HTMLBarsInlinePrecompile.baseDir()).toEqual(path.resolve(__dirname, '..'));
    });
  });

  it('throws when the second argument is not an object', function () {
    expect(() =>
      transform(
        "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('first', 'second');"
      )
    ).toThrow(
      /precompileTemplate can only be invoked with 2 arguments: the template string, and any static options/
    );
  });

  it('throws when argument is not a string', function () {
    expect(() =>
      transform(
        "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate(123);"
      )
    ).toThrow(
      /precompileTemplate should be invoked with at least a single argument \(the template string\)/
    );
  });

  it('throws when no argument is passed', function () {
    expect(() =>
      transform(
        "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate();"
      )
    ).toThrow(
      /precompileTemplate should be invoked with at least a single argument \(the template string\)/
    );
  });

  let expressionTransform: ExtendedPluginBuilder = (env) => {
    return {
      name: 'expression-transform',
      visitor: {
        PathExpression(node, path) {
          if (node.original === 'onePlusOne') {
            let name = env.meta.jsutils.bindExpression('1+1', path, { nameHint: 'two' });
            return env.syntax.builders.path(name);
          }
          return undefined;
        },
      },
    };
  };

  let importTransform: ExtendedPluginBuilder = (env) => {
    return {
      name: 'import-transform',
      visitor: {
        PathExpression(node, path) {
          if (node.original === 'onePlusOne') {
            let name = env.meta.jsutils.bindImport('my-library', 'default', path, {
              nameHint: 'two',
            });
            return env.syntax.builders.path(name);
          }
          return undefined;
        },
      },
    };
  };

  it('includes the original template content', function () {
    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';

        const template = precompileTemplate('hello {{firstName}}');
      `);

    expect(transformed).toContain(`hello {{firstName}}`);
  });

  it('allows AST transform to bind a JS expression', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        const template = precompileTemplate('<Message @text={{onePlusOne}} />');
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two = 1 + 1;
      const template = precompileTemplate("<Message @text={{two}} />", {
        scope: () => ({
          two
        })
      });
    `);
  });

  it('adds locals to the compiled output', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          transforms: [expressionTransform],
        },
      ],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      const template = precompileTemplate('<Message @text={{onePlusOne}} />');
    `);
    expect(transformed).toContain(`"scope": () => [two]`);
  });

  it('allows AST transform to bind a JS import', function () {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [importTransform] }],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        const template = precompileTemplate('<Message @text={{onePlusOne}} />');
      `);

    expect(transformed).toEqualCode(`
      import two from "my-library";
      import { precompileTemplate } from '@ember/template-compilation';
      const template = precompileTemplate("<Message @text={{two}} />", {
        scope: () => ({
          two
        })
      });
    `);
  });

  it('does not smash existing js binding for import', function () {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [importTransform] }],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export function inner() {
          let two = 'twice';
          const template = precompileTemplate('<Message @text={{onePlusOne}} />');
        }
      `);

    expect(transformed).toEqualCode(`
      import two0 from "my-library";
      import { precompileTemplate } from '@ember/template-compilation';
      export function inner() {
        let two = 'twice';
        const template = precompileTemplate("<Message @text={{two0}} />", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('does not smash existing hbs binding for import', function () {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [importTransform] }],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export function inner() {
          const template = precompileTemplate('{{#let "twice" as |two|}}<Message @text={{onePlusOne}} />{{/let}}');
        }
      `);

    expect(transformed).toEqualCode(`
      import two from "my-library";
      import { precompileTemplate } from '@ember/template-compilation';
      let two0 = two;
      export function inner() {
        const template = precompileTemplate("{{#let \\"twice\\" as |two|}}<Message @text={{two0}} />{{/let}}", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('does not smash existing js binding for expression', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          let two = 'twice';
          const template = precompileTemplate('<Message @text={{onePlusOne}} />');
        }
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two0 = 1 + 1;
      export default function () {
        let two = 'twice';
        const template = precompileTemplate("<Message @text={{two0}} />", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('reuses existing imports when possible', () => {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [importTransform] }],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      export default function() {
        const template = precompileTemplate('{{onePlusOne}}{{onePlusOne}}');
      }
    `);

    expect(transformed).toContain(`{{two}}{{two}}`);
    expect(transformed).toContain(`scope: () => ({
      two
    })`);
    expect(transformed).toContain(`import two from "my-library"`);
  });

  it('rebinds existing imports when necessary', () => {
    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [importTransform] }],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      export default function() {
        const template = precompileTemplate('{{onePlusOne}}{{#let "twice" as |two|}}{{onePlusOne}}{{/let}}');
      }
    `);

    //expect(transformed).toContain(`{{two}}{{#let "twice" as |two|}}{{two0}}{{/let}}`);
    expect(transformed).toContain(`{{two}}{{#let \\"twice\\" as |two|}}{{two0}}{{/let}}`);
    expect(transformed).toContain(`scope: () => ({
      two,
      two0
    })`);
    expect(transformed).toContain(`import two from "my-library"`);
    expect(transformed).toContain('let two0 = two');
  });

  it('does not smash own newly-created js binding for expression', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          const template1 = precompileTemplate('<Message @text={{onePlusOne}} />');
          const template2 = precompileTemplate('<Other @text={{onePlusOne}} />');
        }
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two = 1 + 1;
      let two0 = 1 + 1;
      export default function () {
        const template1 = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            two
          })
        });
        const template2 = precompileTemplate("<Other @text={{two0}} />", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('does not smash existing hbs block binding for expression', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          const template = precompileTemplate('{{#let "twice" as |two|}}<Message @text={{onePlusOne}} />{{/let}}');
        }
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two0 = 1 + 1;
      export default function () {
        const template = precompileTemplate("{{#let \\"twice\\" as |two|}}<Message @text={{two0}} />{{/let}}", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('does not smash existing hbs element binding for expression', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          const template = precompileTemplate('<Outer as |two|><Message @text={{onePlusOne}} /></Outer>');
        }
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two0 = 1 + 1;
      export default function () {
        const template = precompileTemplate("<Outer as |two|><Message @text={{two0}} /></Outer>", {
          scope: () => ({
            two0
          })
        });
      }
    `);
  });

  it('understands that block params are only defined in the body, not the arguments, of an element', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          const template = precompileTemplate('<Message @text={{onePlusOne}} as |two|>{{two}}</Message>');
        }
      `);

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from '@ember/template-compilation';
      let two = 1 + 1;
      export default function () {
        const template = precompileTemplate("<Message @text={{two}} as |two|>{{two}}</Message>", {
          scope: () => ({
            two
          })
        });
      }
    `);
  });

  it('does not smash other previously-bound expressions with new ones', () => {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
      ],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      export default function() {
        const template = precompileTemplate('{{onePlusOne}}{{onePlusOne}}');
      }
    `);

    expect(transformed).toContain(`{{two}}{{two0}}`);
    expect(transformed).toContain(`scope: () => ({
      two,
      two0
    })`);
    expect(transformed).toContain(`let two = 1 + 1`);
    expect(transformed).toContain(`let two0 = 1 + 1`);
  });

  it('can bind expressions that need imports', function () {
    let nowTransform: ExtendedPluginBuilder = (env) => {
      return {
        name: 'now-transform',
        visitor: {
          PathExpression(node, path) {
            if (node.original === 'now') {
              let name = env.meta.jsutils.bindExpression(
                (context) => {
                  let identifier = context.import('luxon', 'DateTime');
                  return `${identifier}.now()`;
                },
                path,
                { nameHint: 'current' }
              );
              return env.syntax.builders.path(name);
            }
            return undefined;
          },
        },
      };
    };

    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [nowTransform] }],
    ];

    let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        export default function() {
          const template = precompileTemplate('<Message @when={{now}} />');
        }
      `);

    expect(transformed).toMatch(/let current = DateTime.now()/);
    expect(transformed).toMatch(/import { DateTime } from "luxon"/);
    expect(transformed).toContain('when={{current}}');
  });

  it('can emit side-effectful expression that need imports', function () {
    let compatTransform: ExtendedPluginBuilder = (env) => {
      return {
        name: 'compat-transform',
        visitor: {
          ElementNode(node) {
            if (node.tag === 'Thing') {
              env.meta.jsutils.emitExpression((context) => {
                let identifier = context.import('ember-thing', '*', 'thing');
                return `window.define('my-app/components/thing', ${identifier})`;
              });
            }
          },
        },
      };
    };

    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [compatTransform] }],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      export default function() {
        const template = precompileTemplate('<Thing />');
      }
    `);

    expect(transformed).toContain(`import * as thing from "ember-thing"`);
    expect(transformed).toContain(`window.define('my-app/components/thing', thing)`);
  });

  it('can emit side-effectful import', function () {
    let compatTransform: ExtendedPluginBuilder = (env) => {
      return {
        name: 'compat-transform',
        visitor: {
          ElementNode(node) {
            if (node.tag === 'Thing') {
              env.meta.jsutils.importForSideEffect('setup-the-things');
            }
          },
        },
      };
    };

    plugins = [
      [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [compatTransform] }],
    ];

    let transformed = transform(stripIndent`
      import { precompileTemplate } from '@ember/template-compilation';
      export default function() {
        const template = precompileTemplate('<Thing />');
      }
    `);

    expect(transformed).toContain(`import "setup-the-things"`);
  });

  describe('source-to-source', function () {
    const color: ExtendedPluginBuilder = (env) => {
      return {
        name: 'simple-transform',
        visitor: {
          PathExpression(node) {
            if (node.original === 'red') {
              return env.syntax.builders.string('#ff0000');
            }
            return undefined;
          },
        },
      };
    };

    it('can run an ast transform inside precompileTemplate', function () {
      plugins = [
        [HTMLBarsInlinePrecompile, { compiler, targetFormat: 'hbs', transforms: [color] }],
      ];

      let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        const template = precompileTemplate('<Message @color={{red}} />');
      `);

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from '@ember/template-compilation';
        const template = precompileTemplate("<Message @color={{\\"#ff0000\\"}} />");
      `);
    });

    it('can run an ast transform inside hbs backticks', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          {
            compiler,
            targetFormat: 'hbs',
            transforms: [color],
            enableLegacyModules: ['ember-cli-htmlbars'],
          },
        ],
      ];

      let transformed = transform(
        "import { hbs } from 'ember-cli-htmlbars'; const template = hbs`<Message @color={{red}} />`;"
      );

      expect(transformed).toEqualCode(`
        import { hbs } from 'ember-cli-htmlbars';
        const template = hbs\`<Message @color={{"#ff0000"}} />\`;
      `);
    });

    it('can create the options object for precompileTemplate', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
        ],
      ];

      let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        const template = precompileTemplate('<Message @text={{onePlusOne}} />');
      `);

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from '@ember/template-compilation';
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            two
          })
        });
      `);
    });

    it('adds scope to existing options object', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
        ],
      ];

      let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        import Message from 'message';
        const template = precompileTemplate('<Message @text={{onePlusOne}} />', {
          moduleName: 'customModuleName'
        });
      `);

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from '@ember/template-compilation';
        import Message from 'message';
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          moduleName: 'customModuleName',
          scope: () => ({
            two
          })
        });
      `);
    });

    it('adds new locals to preexisting scope', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          { compiler, targetFormat: 'hbs', transforms: [expressionTransform] },
        ],
      ];

      let transformed = transform(stripIndent`
        import { precompileTemplate } from '@ember/template-compilation';
        import Message from 'message';
        const template = precompileTemplate('<Message @text={{onePlusOne}} />', {
          scope: () => ({
            Message
          })
        });
      `);

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from '@ember/template-compilation';
        import Message from 'message';
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            Message,
            two
          })
        });
      `);
    });

    it('switches from legacy callExpressions to precompileTemplate when needed to support scope', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          {
            compiler,
            targetFormat: 'hbs',
            transforms: [expressionTransform],
            enableLegacyModules: ['ember-cli-htmlbars'],
          },
        ],
      ];

      let transformed = transform(stripIndent`
        import { hbs } from 'ember-cli-htmlbars';
        const template = hbs('<Message @text={{onePlusOne}} />');
      `);

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from "@ember/template-compilation";
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            two
          })
        });
      `);
    });

    it('switches from hbs backticks to precompileTemplate when needed to support scope', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          {
            compiler,
            targetFormat: 'hbs',
            transforms: [expressionTransform],
            enableLegacyModules: ['ember-cli-htmlbars'],
          },
        ],
      ];

      let transformed = transform(
        "import { hbs } from 'ember-cli-htmlbars'; const template = hbs`<Message @text={{onePlusOne}} />`;"
      );

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from "@ember/template-compilation";
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            two
          })
        });
      `);
    });

    it('does not remove original import if there are still callsites using it', function () {
      plugins = [
        [
          HTMLBarsInlinePrecompile,
          {
            compiler,
            targetFormat: 'hbs',
            transforms: [expressionTransform],
            enableLegacyModules: ['ember-cli-htmlbars'],
          },
        ],
      ];

      let transformed = transform(
        "import { hbs } from 'ember-cli-htmlbars'; const template = hbs`<Message @text={{onePlusOne}} />`; const other = hbs`hello`;"
      );

      expect(transformed).toEqualCode(`
        import { precompileTemplate } from "@ember/template-compilation";
        import { hbs } from 'ember-cli-htmlbars';
        let two = 1 + 1;
        const template = precompileTemplate("<Message @text={{two}} />", {
          scope: () => ({
            two
          })
        });
        const other = hbs\`hello\`;
      `);
    });
  });

  it('removes original import when there are multiple callsites that all needed replacement', function () {
    plugins = [
      [
        HTMLBarsInlinePrecompile,
        {
          compiler,
          targetFormat: 'hbs',
          transforms: [expressionTransform],
          enableLegacyModules: ['ember-cli-htmlbars'],
        },
      ],
    ];

    let transformed = transform(
      "import { hbs } from 'ember-cli-htmlbars'; const template = hbs`<Message @text={{onePlusOne}} />`; const other = hbs`{{onePlusOne}}`;"
    );

    expect(transformed).toEqualCode(`
      import { precompileTemplate } from "@ember/template-compilation";
      let two = 1 + 1;
      let two0 = 1 + 1;
      const template = precompileTemplate("<Message @text={{two}} />", {
        scope: () => ({
          two
        })
      });
      const other = precompileTemplate("{{two0}}", {
        scope: () => ({
          two0
        })
      });
    `);
  });

  describe('scope', function () {
    it('correctly handles scope function (non-block arrow function)', function () {
      let source = 'hello';
      let spy = sinon.spy(compiler, 'precompile');

      transform(
        `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { scope: () => ({ foo, bar }) });`
      );
      expect(spy.firstCall.lastArg).toHaveProperty('locals', ['foo', 'bar']);
    });

    it('correctly handles scope function (block arrow function)', function () {
      let source = 'hello';
      let spy = sinon.spy(compiler, 'precompile');

      transform(
        `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { scope: () => { return { foo, bar }; }});`
      );

      expect(spy.firstCall.lastArg).toHaveProperty('locals', ['foo', 'bar']);
    });

    it('correctly handles scope function (normal function)', function () {
      let source = 'hello';
      let spy = sinon.spy(compiler, 'precompile');

      transform(
        `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { scope: function() { return { foo, bar }; }});`
      );

      expect(spy.firstCall.lastArg).toHaveProperty('locals', ['foo', 'bar']);
    });

    it('correctly handles scope function (object method)', function () {
      let source = 'hello';
      let spy = sinon.spy(compiler, 'precompile');

      transform(
        `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { scope() { return { foo, bar }; }});`
      );
      expect(spy.firstCall.lastArg).toHaveProperty('locals', ['foo', 'bar']);
    });

    it('correctly handles scope function with coverage', function () {
      let source = 'hello';
      let spy = sinon.spy(compiler, 'precompile');

      transform(
        `import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('${source}', { scope() { ++cov_2rkfh72wo; return { foo, bar }; }});`
      );
      expect(spy.firstCall.lastArg).toHaveProperty('locals', ['foo', 'bar']);
    });

    it('errors if scope contains mismatched keys/values', function () {
      expect(() => {
        transform(
          "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello', { scope: () => ({ foo: bar }) });"
        );
      }).toThrow(
        /Scope objects for `precompileTemplate` may only contain direct references to in-scope values, e.g. { foo } or { foo: foo }/
      );
    });

    it('errors if scope is not an object', function () {
      expect(() => {
        transform(
          "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello', { scope: () => ['foo', 'bar'] });"
        );
      }).toThrow(
        /Scope objects for `precompileTemplate` must be an object expression containing only references to in-scope values/
      );
    });

    it('errors if scope contains any non-reference values', function () {
      expect(() => {
        transform(
          "import { precompileTemplate } from '@ember/template-compilation';\nvar compiled = precompileTemplate('hello', { scope: () => ({ foo, bar: 123 }) });"
        );
      }).toThrow(
        /Scope objects for `precompileTemplate` may only contain direct references to in-scope values, e.g. { bar } or { bar: bar }/
      );
    });
  });
});
