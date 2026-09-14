import { parse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import generatePkg from '@babel/generator';

const traverse = traversePkg.default || traversePkg;
const generate = generatePkg.default || generatePkg;

function getPayloadPropName(memPath) {
  const node = memPath.node;
  if (!node) return null;
  const obj = node.object;
  const prop = node.property;

  if (!prop || prop.type !== 'Identifier') return null;
  if (['type', 'action', 'role'].includes(prop.name)) return null;

  // Handles payload.userId and payload?.userId
  if (obj && obj.type === 'Identifier' && ['payload', 'data', 'event'].includes(obj.name)) {
    return prop.name;
  }

  // Handles action.payload.userId and action?.payload?.userId
  if (
    obj &&
    (obj.type === 'MemberExpression' || obj.type === 'OptionalMemberExpression') &&
    obj.property &&
    obj.property.type === 'Identifier' &&
    ['payload', 'data'].includes(obj.property.name)
  ) {
    return prop.name;
  }

  return null;
}

function collectDestructuredProps(pattern, targetSet) {
  if (!pattern) return;
  if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties) {
      if (prop.type === 'ObjectProperty') {
        if (prop.value.type === 'Identifier') {
          targetSet.add(prop.value.name);
        } else if (prop.value.type === 'ObjectPattern' || prop.value.type === 'ArrayPattern') {
          collectDestructuredProps(prop.value, targetSet);
        } else if (prop.value.type === 'AssignmentPattern') {
          if (prop.value.left.type === 'Identifier') {
            targetSet.add(prop.value.left.name);
          } else {
            collectDestructuredProps(prop.value.left, targetSet);
          }
        } else if (prop.key && prop.key.type === 'Identifier') {
          targetSet.add(prop.key.name);
        }
      } else if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
        targetSet.add(`...${prop.argument.name}`);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of pattern.elements) {
      if (!elem) continue;
      if (elem.type === 'Identifier') {
        targetSet.add(elem.name);
      } else if (elem.type === 'ObjectPattern' || elem.type === 'ArrayPattern') {
        collectDestructuredProps(elem, targetSet);
      } else if (elem.type === 'RestElement' && elem.argument && elem.argument.type === 'Identifier') {
        targetSet.add(`...${elem.argument.name}`);
      }
    }
  }
}

export function extractProtocolsFromAST(astPath) {
  const protocols = new Set();

  astPath.traverse({
    SwitchCase(casePath) {
      if (casePath.node.test && casePath.node.test.type === 'StringLiteral') {
        const actionName = casePath.node.test.value;
        const payloadProps = new Set();

        casePath.traverse({
          'MemberExpression|OptionalMemberExpression'(memPath) {
            const propName = getPayloadPropName(memPath);
            if (propName) payloadProps.add(propName);
          },
          VariableDeclarator(varPath) {
            const init = varPath.node.init;
            if (!init) return;

            const isPayloadSource =
              (init.type === 'Identifier' && ['payload', 'data', 'event'].includes(init.name)) ||
              ((init.type === 'MemberExpression' || init.type === 'OptionalMemberExpression') &&
                init.property &&
                init.property.type === 'Identifier' &&
                ['payload', 'data'].includes(init.property.name));

            if (isPayloadSource && varPath.node.id) {
              collectDestructuredProps(varPath.node.id, payloadProps);
            }
          }
        });

        if (payloadProps.size > 0) {
          protocols.add(`${actionName}(${Array.from(payloadProps).join(', ')})`);
        } else {
          protocols.add(actionName);
        }
      }
    },
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      let funcName = null;

      // Standalone functions: dispatch(...)
      if (callee.type === 'Identifier') {
        funcName = callee.name;
      }
      // Method calls: emitter.emit(...) / store.dispatch(...)
      else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
        funcName = callee.property.name;
      }

      if (funcName && ['emit', 'dispatch', 'trigger', 'send'].includes(funcName)) {
        const firstArg = callPath.node.arguments[0];
        if (!firstArg) return;

        // Pattern: emitter.emit('EVENT_NAME')
        if (firstArg.type === 'StringLiteral') {
          protocols.add(`emit:${firstArg.value}`);
        }
        // Pattern: dispatch({ type: 'ACTION_TYPE' })
        else if (firstArg.type === 'ObjectExpression') {
          const typeProp = firstArg.properties.find(
            (p) =>
              p.type === 'ObjectProperty' &&
              ((p.key.type === 'Identifier' && p.key.name === 'type') ||
                (p.key.type === 'StringLiteral' && p.key.value === 'type')) &&
              p.value.type === 'StringLiteral'
          );
          if (typeProp) {
            protocols.add(`dispatch:${typeProp.value.value}`);
          }
        }
      }
    },
    BinaryExpression(binPath) {
      if (['===', '=='].includes(binPath.node.operator)) {
        let stringVal = null;
        if (binPath.node.right.type === 'StringLiteral') stringVal = binPath.node.right.value;
        if (binPath.node.left.type === 'StringLiteral') stringVal = binPath.node.left.value;

        if (stringVal && /^[A-Z0-9_-]{3,}$/.test(stringVal)) {
          protocols.add(stringVal);
        }
      }
    }
  });

  return Array.from(protocols);
}

const CORE_LOGIC_REGEX = /^#?(is|has|can|should|calc|calculate|validate|check|parse|format|sanitize)[A-Z0-9_]/;

function isHookCall(callNode) {
  if (!callNode || callNode.type !== 'CallExpression') return false;
  const callee = callNode.callee;
  if (callee.type === 'Identifier') {
    return /^use[A-Z0-9_]/.test(callee.name);
  }
  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    return /^use[A-Z0-9_]/.test(callee.property.name);
  }
  return false;
}

function isHookStatement(stmt) {
  if (!stmt) return false;
  if (stmt.type === 'ExpressionStatement' && isHookCall(stmt.expression)) {
    return true;
  }
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations.some((decl) => decl.init && isHookCall(decl.init));
  }
  return false;
}

function isHookCallback(astPath) {
  if (!astPath.parentPath) return false;
  const parent = astPath.parentPath.node;
  if (parent.type === 'CallExpression' && isHookCall(parent)) {
    return true;
  }
  return false;
}

function simplifyHookCall(call) {
  if (!call || call.type !== 'CallExpression') return call;
  const calleeName = call.callee.type === 'Identifier' ? call.callee.name : call.callee.property?.name || '';
  if (['useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useCallback', 'useMemo'].includes(calleeName)) {
    if (call.arguments.length > 0) {
      const firstArg = call.arguments[0];
      if (['ArrowFunctionExpression', 'FunctionExpression'].includes(firstArg.type)) {
        firstArg.body = {
          type: 'BlockStatement',
          body: []
        };
        firstArg.expression = false;
        delete firstArg.leadingComments;
        delete firstArg.innerComments;
        delete firstArg.trailingComments;
      }
    }
  }
  return call;
}

function simplifyHookStatement(stmt) {
  if (!stmt) return stmt;
  if (stmt.type === 'ExpressionStatement' && isHookCall(stmt.expression)) {
    simplifyHookCall(stmt.expression);
  } else if (stmt.type === 'VariableDeclaration') {
    for (const decl of stmt.declarations) {
      if (decl.init && isHookCall(decl.init)) {
        simplifyHookCall(decl.init);
      }
    }
  }
  return stmt;
}

function getFunctionName(astPath) {
  const node = astPath.node;
  if (node.id && node.id.name) return node.id.name;
  if (astPath.parentPath) {
    if (astPath.parentPath.isVariableDeclarator() && astPath.parentPath.node.id.type === 'Identifier') {
      return astPath.parentPath.node.id.name;
    }
    if (astPath.parentPath.isObjectProperty() || astPath.parentPath.isClassProperty()) {
      if (astPath.parentPath.node.key) {
        if (astPath.parentPath.node.key.type === 'Identifier') return astPath.parentPath.node.key.name;
        if (astPath.parentPath.node.key.type === 'PrivateName' && astPath.parentPath.node.key.id) {
          return `#${astPath.parentPath.node.key.id.name}`;
        }
      }
    }
  }
  if (node.key) {
    if (node.key.type === 'Identifier') return node.key.name;
    if (node.key.type === 'PrivateName' && node.key.id) return `#${node.key.id.name}`;
  }
  return null;
}

/**
 * Skeletonizes JavaScript/TypeScript code using Babel AST traversal.
 * Truncates function bodies with `throw new Error(...)` to infer `never` return types
 * while preserving React hook dependency arrays, type contracts, and JSDoc comments.
 * @param {string} code
 * @param {boolean} isTypeScript
 * @param {number} [maxPreserveLines=8]
 * @param {boolean} [isJSX=true]
 * @returns {string}
 */
export function skeletonizeWithAST(code, isTypeScript, maxPreserveLines = 8, isJSX = true) {
  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        isJSX ? 'jsx' : null,
        isTypeScript ? 'typescript' : null,
        ['decorators', { decoratorsBeforeExport: true }],
        'decoratorAutoAccessors',
        'explicitResourceManagement',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'classStaticBlock',
        'dynamicImport',
        'exportDefaultFrom',
        'importAttributes'
      ].filter(Boolean)
    });

    traverse(ast, {
      JSXElement(jsxPath) {
        const children = jsxPath.node.children;
        if (!children || children.length < 3) return;

        const newChildren = [];
        let lastTagName = null;
        let repeatCount = 0;
        let pendingWhitespace = [];

        for (const child of children) {
          if (child.type === 'JSXText' && child.value.trim() === '') {
            if (repeatCount > 0) {
              continue;
            }
            pendingWhitespace.push(child);
            continue;
          }

          if (child.type === 'JSXElement' && child.openingElement.name.type === 'JSXIdentifier') {
            const tagName = child.openingElement.name.name;
            if (tagName === lastTagName) {
              repeatCount++;
              pendingWhitespace = [];
              continue;
            } else {
              if (repeatCount > 0) {
                newChildren.push({
                  type: 'JSXExpressionContainer',
                  expression: {
                    type: 'JSXEmptyExpression',
                    innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
                  }
                });
              }
              if (pendingWhitespace.length > 0) {
                newChildren.push(...pendingWhitespace);
                pendingWhitespace = [];
              }
              lastTagName = tagName;
              repeatCount = 0;
              newChildren.push(child);
            }
          } else {
            if (repeatCount > 0) {
              newChildren.push({
                type: 'JSXExpressionContainer',
                expression: {
                  type: 'JSXEmptyExpression',
                  innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
                }
              });
              lastTagName = null;
              repeatCount = 0;
            }
            if (pendingWhitespace.length > 0) {
              newChildren.push(...pendingWhitespace);
              pendingWhitespace = [];
            }
            newChildren.push(child);
          }
        }

        if (repeatCount > 0) {
          newChildren.push({
            type: 'JSXExpressionContainer',
            expression: {
              type: 'JSXEmptyExpression',
              innerComments: [{ type: 'CommentBlock', value: ` ...${repeatCount} repeating <${lastTagName} /> omitted... ` }]
            }
          });
        }
        if (pendingWhitespace.length > 0) {
          newChildren.push(...pendingWhitespace);
        }

        jsxPath.node.children = newChildren;
      }
    });

    traverse(ast, {
      'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassMethod|ObjectMethod|StaticBlock'(astPath) {
        if (astPath.isStaticBlock()) {
          const node = astPath.node;
          const startLine = node.loc ? node.loc.start.line : 0;
          const endLine = node.loc ? node.loc.end.line : 0;
          const totalLines = endLine - startLine + 1;
          if (node.loc && totalLines <= maxPreserveLines) return;
          node.body = [];
          node.innerComments = [{ type: 'CommentBlock', value: ` ...static block impl (${totalLines} lines)... ` }];
          astPath.skip();
          return;
        }

        // Skip direct processing of hook callbacks (handled by simplifyHookCall on the parent component)
        if (isHookCallback(astPath)) {
          astPath.skip();
          return;
        }

        const node = astPath.node;
        if (!node.body) return;

        const startLine = node.loc ? node.loc.start.line : 0;
        const endLine = node.loc ? node.loc.end.line : 0;
        const totalLines = endLine - startLine + 1;

        // Preserve short functions within configured threshold
        if (node.loc && totalLines <= maxPreserveLines) {
          return;
        }

        const funcName = getFunctionName(astPath);
        if (funcName && CORE_LOGIC_REGEX.test(funcName)) {
          return;
        }
        const isConstructor =
          node.kind === 'constructor' ||
          (astPath.isClassMethod() && node.key && node.key.type === 'Identifier' && node.key.name === 'constructor');
        const isSetter = node.kind === 'set';

        const protocols = extractProtocolsFromAST(astPath);
        let commentText = ` ...impl (${totalLines} lines)... `;
        if (protocols.length > 0) {
          commentText = ` @payloads: ${protocols.join(' | ')} (truncated ${totalLines} lines) `;
        }

        const leading = node.leadingComments;

        const hookStatements = [];
        let superCallStatement = null;

        if (node.body && node.body.type === 'BlockStatement' && Array.isArray(node.body.body)) {
          for (const stmt of node.body.body) {
            if (isConstructor && !superCallStatement) {
              if (
                stmt.type === 'ExpressionStatement' &&
                stmt.expression &&
                stmt.expression.type === 'CallExpression' &&
                stmt.expression.callee.type === 'Super'
              ) {
                superCallStatement = stmt;
              }
            }
            if (isHookStatement(stmt)) {
              hookStatements.push(simplifyHookStatement(stmt));
            }
          }
        }

        let replacementBody;

        if (isConstructor) {
          const ctorBody = superCallStatement ? [superCallStatement] : [];
          replacementBody = {
            type: 'BlockStatement',
            body: ctorBody,
            innerComments: [{ type: 'CommentBlock', value: ` ...constructor impl (${totalLines} lines)... ` }]
          };
        } else if (isSetter) {
          replacementBody = {
            type: 'BlockStatement',
            body: [],
            innerComments: [{ type: 'CommentBlock', value: commentText }]
          };
        } else {
          // Emit an unconditional throw so the truncated function is inferred as
          // returning `never`. `never` is assignable to any declared return type
          // (including Promise<T>), so TypeScript checking still passes without
          // an `as any` escape that would silently defeat downstream type safety.
          const stubThrow = {
            type: 'ThrowStatement',
            argument: {
              type: 'NewExpression',
              callee: { type: 'Identifier', name: 'Error' },
              arguments: [
                {
                  type: 'StringLiteral',
                  value: 'Implementation omitted by repomix-semantic-compressor'
                }
              ]
            },
            leadingComments: [{ type: 'CommentBlock', value: commentText }]
          };

          replacementBody = {
            type: 'BlockStatement',
            body: hookStatements.length > 0 ? [...hookStatements, stubThrow] : [stubThrow]
          };
        }

        if (astPath.isArrowFunctionExpression() && node.body.type !== 'BlockStatement') {
          node.body = replacementBody;
          node.expression = false;
        } else if (node.body && node.body.type === 'BlockStatement') {
          node.body = replacementBody;
        }

        if (leading) {
          node.leadingComments = leading;
        }

        astPath.skip();
      }
    });

    return generate(ast, {
      retainLines: false,
      compact: false,
      comments: true
    }).code;
  } catch {
    return code;
  }
}
