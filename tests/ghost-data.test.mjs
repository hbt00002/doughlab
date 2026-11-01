import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, parseNumber, buildGhostData } from '../src/ghost-data.js';

const gapminder = () => parseCSV(readFileSync(new URL('./fixtures/gapminder.csv', import.meta.url), 'utf8'));

test('parseCSV reads comma, quotes and BOM', () => {
  const t = parseCSV('﻿a,b\n"x, y",2');
  assert.deepEqual(t.header, ['a', 'b']);
  assert.deepEqual(t.rows, [['x, y', '2']]);
});

test('parseCSV reads semicolon with decimal comma', () => {
  const t = parseCSV('a;b;c\n1,5;2;3');
  assert.equal(t.delimiter, ';');
  assert.equal(parseNumber(t.rows[0][0], t.delimiter), 1.5);
});

test('parseCSV reads tab-separated', () => {
  const t = parseCSV('a\tb\n1\t2\n');
  assert.equal(t.delimiter, '\t');
  assert.deepEqual(t.rows, [['1', '2']]);
});

test('Gapminder standardised PCA is 46.3 / 25.5 / 19.0 %', () => {
  const table = gapminder();
  const idx = (name) => table.header.indexOf(name);
  const data = buildGhostData(table, {
    columns: ['year', 'pop', 'lifeExp', 'gdpPercap'].map(idx),
    colorBy: idx('continent'),
    standardize: true,
    logSkewed: false,
  });
  assert.deepEqual(data.ratios.map((r) => Math.round(r * 1000) / 10), [46.3, 25.5, 19.0]);
  assert.equal(data.dropped, 0);
});

test.todo('buildGhostData exposes original variables');
