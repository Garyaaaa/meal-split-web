const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');

const scopes = [
  {
    name: 'start',
    wxml: 'pages/start/start.wxml',
    wxss: 'pages/start/start.wxss',
    controls: [
      {
        className: 'draft-link',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 152],
        compact: true,
        line: true,
      },
      { className: 'segment', normalHeight: ['min-height', 88], line: true },
      {
        className: 'stepper-button',
        normalHeight: ['min-height', 88],
        normalWidth: ['width', 88],
        compact: true,
        line: true,
        fixedHeight: true,
      },
      { className: 'name-input', normalHeight: ['height', 88], fixedHeight: true },
      {
        className: 'delete-button',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 96],
        compact: true,
        line: true,
      },
      { className: 'add-button', normalHeight: ['min-height', 88], line: true },
      { className: 'submit-button', normalHeight: ['min-height', 104], line: true },
    ],
  },
  {
    name: 'ledger',
    wxml: 'pages/ledger/ledger.wxml',
    wxss: 'pages/ledger/ledger.wxss',
    controls: [
      {
        className: 'add-expense-button',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 168],
        compact: true,
        line: true,
      },
      { className: 'empty-card', normalHeight: ['min-height', 88] },
      { className: 'expense-row', normalHeight: ['min-height', 124] },
      {
        className: 'expense-delete',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 92],
        compact: true,
        line: true,
      },
      { className: 'participant-button', normalHeight: ['min-height', 92], line: true },
      { className: 'result-button', normalHeight: ['min-height', 104], line: true },
    ],
  },
  {
    name: 'expense editor',
    wxml: 'components/expense-editor/expense-editor.wxml',
    wxss: 'components/expense-editor/expense-editor.wxss',
    controls: [
      { className: 'editor-mask', fullCoverage: true },
      { className: 'editor-sheet', fullWidth: true },
      {
        className: 'close-button',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 100],
        compact: true,
        line: true,
      },
      { className: 'amount-input', normalHeight: ['height', 90], fixedHeight: true, line: true },
      {
        className: 'choice-chip',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 88],
        compact: true,
        line: true,
      },
      { className: 'split-segment', normalHeight: ['min-height', 88], line: true },
      {
        className: 'bearer-chip',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 88],
        compact: true,
      },
      { className: 'note-input', normalHeight: ['min-height', 88] },
      { className: 'save-button', normalHeight: ['min-height', 100], line: true },
    ],
  },
  {
    name: 'result',
    wxml: 'pages/result/result.wxml',
    wxss: 'pages/result/result.wxss',
    controls: [
      {
        className: 'finish-button',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 112],
        compact: true,
        line: true,
      },
      {
        className: 'collector-chip',
        normalHeight: ['min-height', 88],
        normalWidth: ['min-width', 150],
        compact: true,
      },
      { className: 'copy-button', normalHeight: ['min-height', 104], line: true },
      { className: 'return-button', normalHeight: ['min-height', 88], line: true },
    ],
  },
];

function parseDeclarations(source) {
  const declarations = new Map();
  for (const entry of source.split(';')) {
    const separator = entry.indexOf(':');
    if (separator !== -1) {
      declarations.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim());
    }
  }
  return declarations;
}

function parseRules(source) {
  const rules = new Map();
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = parseDeclarations(match[2]);
    for (const selector of match[1].split(',').map((value) => value.trim())) {
      const resolved = rules.get(selector) || new Map();
      for (const [property, value] of declarations) {
        resolved.set(property, value);
      }
      rules.set(selector, resolved);
    }
  }
  return rules;
}

function splitStyle(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const media = [];
  const ranges = [];
  const pattern = /@media\s*\(([^)]*)\)\s*\{/g;
  let match;

  while ((match = pattern.exec(clean))) {
    const open = pattern.lastIndex - 1;
    let depth = 1;
    let cursor = open + 1;
    while (cursor < clean.length && depth > 0) {
      if (clean[cursor] === '{') depth += 1;
      if (clean[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, 'unclosed media query');
    media.push({ condition: match[1].replace(/\s+/g, ' ').trim(), body: clean.slice(open + 1, cursor - 1) });
    ranges.push([match.index, cursor]);
    pattern.lastIndex = cursor;
  }

  let base = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    base += clean.slice(cursor, start);
    cursor = end;
  }
  base += clean.slice(cursor);
  return { base, media };
}

function lengthValue(declarations, property, unit) {
  const match = String(declarations.get(property) || '').match(new RegExp(`^(\\d+)${unit}$`));
  return match ? Number(match[1]) : null;
}

function interactiveClasses(wxml, knownClasses) {
  const found = [];
  for (const match of wxml.matchAll(/<(button|input|textarea|view)\b[^>]*>/g)) {
    const tag = match[0];
    const isInteractive = match[1] !== 'view' || /\b(?:bindtap|catchtap)="/.test(tag);
    if (!isInteractive) continue;
    const classAttribute = tag.match(/\bclass="([^"]*)"/);
    assert.ok(classAttribute, `interactive tag has no class: ${tag}`);
    const matches = knownClasses.filter((className) => (
      new RegExp(`(?:^|\\s)${className}(?:\\s|$)`).test(classAttribute[1])
    ));
    assert.equal(matches.length, 1, `interactive tag needs one touch contract: ${tag}`);
    found.push(matches[0]);
  }
  return found;
}

test('interactive elements retain their standard-width rpx design sizing', () => {
  for (const scope of scopes) {
    const wxml = fs.readFileSync(path.join(projectRoot, scope.wxml), 'utf8');
    const wxss = fs.readFileSync(path.join(projectRoot, scope.wxss), 'utf8');
    const { base } = splitStyle(wxss);
    const rules = parseRules(base);
    const knownClasses = scope.controls.map(({ className }) => className);
    const usedClasses = new Set(interactiveClasses(wxml, knownClasses));
    assert.deepEqual(usedClasses, new Set(knownClasses), `${scope.name} interactive inventory drifted`);

    for (const control of scope.controls) {
      const declarations = rules.get(`.${control.className}`);
      assert.ok(declarations, `${scope.name} missing .${control.className}`);
      if (control.normalHeight) {
        const [property, minimum] = control.normalHeight;
        assert.ok(
          lengthValue(declarations, property, 'rpx') >= minimum,
          `${scope.name} .${control.className} lost its ${minimum}rpx design size`,
        );
      }
      if (control.normalWidth) {
        const [property, minimum] = control.normalWidth;
        assert.ok(
          lengthValue(declarations, property, 'rpx') >= minimum,
          `${scope.name} .${control.className} lost its ${minimum}rpx design width`,
        );
      }
      if (control.fullCoverage) {
        for (const edge of ['top', 'right', 'bottom', 'left']) {
          assert.equal(declarations.get(edge), '0');
        }
      }
      if (control.fullWidth) {
        assert.equal(declarations.get('right'), '0');
        assert.equal(declarations.get('left'), '0');
      }
    }
  }
});

test('narrow-width media guarantees 44px interactive targets', () => {
  for (const scope of scopes) {
    const wxss = fs.readFileSync(path.join(projectRoot, scope.wxss), 'utf8');
    assert.doesNotMatch(wxss, /\bmax\s*\(/);
    const { media } = splitStyle(wxss);
    const narrow = media.filter(({ condition }) => condition === 'max-width: 374px');
    assert.ok(narrow.length > 0, `${scope.name} missing max-width: 374px rules`);
    const rules = parseRules(narrow.map(({ body }) => body).join('\n'));

    for (const control of scope.controls) {
      const declarations = rules.get(`.${control.className}`);
      assert.ok(declarations, `${scope.name} missing narrow .${control.className}`);
      assert.ok(
        lengthValue(declarations, 'min-height', 'px') >= 44,
        `${scope.name} .${control.className} is shorter than 44px on narrow screens`,
      );
      if (control.compact) {
        assert.ok(
          lengthValue(declarations, 'min-width', 'px') >= 44,
          `${scope.name} .${control.className} is narrower than 44px`,
        );
      }
      if (control.fixedHeight) {
        assert.ok(lengthValue(declarations, 'height', 'px') >= 44);
      }
      if (control.line) {
        assert.equal(declarations.get('line-height'), '44px');
      }
    }
  }
});
