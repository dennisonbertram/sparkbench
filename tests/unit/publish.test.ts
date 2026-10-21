import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compare, pinKey, type VerifyFacts } from '../../scripts/parts/publish';

const sht31 = JSON.parse(readFileSync('.claude/skills/part-sht31/part.json', 'utf8'));
const facts: VerifyFacts = {
  mpn: 'SHT31',
  breakoutPins: [
    { name: 'VCC', role: 'power', required: true },
    { name: 'GND', role: 'gnd', required: true },
    { name: 'SCL', role: 'io', required: true },
    { name: 'SDA', role: 'io', required: true },
    { name: 'AD', role: 'io', required: false },
    { name: 'AL', role: 'io', required: false },
  ],
  i2cAddresses: [0x44, 0x45],
  defaultI2cAddress: 0x44,
  vmin: 2.4,
  vmax: 5.5,
  conversions: [
    { quantity: 'temperature', scale: 175 / 65535, offset: -45 },
    { quantity: 'humidity', scale: 100 / 65535, offset: 0 },
  ],
  chipId: null,
  sources: ['https://sensirion.com'],
};

describe('publish: independent datasheet reading must agree', () => {
  it('normalises pin names', () => {
    expect(pinKey('VIN')).toBe('PWR');
    expect(pinKey('3.3V')).toBe('PWR');
    expect(pinKey('SDI/SDA')).toBe('SDA');
  });
  it('accepts the SHT31 reference part', () => {
    expect(compare(sht31, facts)).toEqual([]);
  });
  it('flags swapped pins, a wrong address, a wider supply range and a wrong formula', () => {
    const bad = {
      ...facts,
      breakoutPins: [facts.breakoutPins[0], facts.breakoutPins[1], facts.breakoutPins[3], facts.breakoutPins[2], ...facts.breakoutPins.slice(4)],
      i2cAddresses: [0x40],
      defaultI2cAddress: 0x40,
      vmax: 3.6,
      conversions: [{ quantity: 'temperature', scale: 165 / 65535, offset: -40 }],
    };
    const d = compare(sht31, bad).join('\n');
    expect(d).toMatch(/header pin 3/);
    expect(d).toMatch(/I2C address/);
    expect(d).toMatch(/maximum supply/);
    expect(d).toMatch(/temperature/);
  });
});

describe('resolution evidence must quote its source', () => {
  it('accepts a quote that appears on the page and rejects one that does not', async () => {
    const { quoteFound } = await import('../../scripts/parts/publish');
    const page = () => '<p>Flow pulse characteristics&nbsp; F = (98 * Q) ± 2%  Q = L / MIN</p>';
    expect(quoteFound("Datasheet: 'F = (98 * Q) ± 2% Q = L / MIN'.", 'https://a.example/1', page)).toBe(true);
    expect(quoteFound("Datasheet: 'Output pulse high level 4.7 V'.", 'https://a.example/2', page)).toBe(false);
    expect(quoteFound('No quote at all, just a claim about the part.', 'https://a.example/3', page)).toBe(false);
  });
});
