import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAR_END, LIVES, arrivalsFor } from '../../shared/games/barDash';
import { newBar, pour, stepBar } from './barDash';

describe('Bar Dash', () => {
  it('everyone gets the same customers', () => {
    assert.deepEqual(arrivalsFor(3), arrivalsFor(3));
  });

  it('a drink serves the first customer on its bar; their glass comes back and is caught if you are there', () => {
    const b = newBar(1);
    b.arrivals = [];
    b.customers = [{ bar: 2, x: 200, speed: 0 }];
    pour(b, 2, 0);
    for (let i = 0; i < 30; i++) stepBar(b, 0.05, i * 50);
    assert.equal(b.served, 1);
    assert.equal(b.customers.length, 0);
    assert.equal(b.glasses.length, 1);
    for (let i = 0; i < 80; i++) stepBar(b, 0.05, 2000 + i * 50);
    assert.equal(b.glasses.length, 0);
    assert.equal(b.lives, LIVES, 'caught');
  });

  it('a glass you are not there for breaks; a customer at your end costs a life; a wasted drink too', () => {
    const b = newBar(1);
    b.arrivals = [];
    b.glasses = [{ bar: 3, x: BAR_END - 5, speed: 150 }];
    b.customers = [{ bar: 1, x: BAR_END - 2, speed: 100 }];
    stepBar(b, 0.1, 0);
    assert.equal(b.lives, LIVES - 2);
    pour(b, 0, 100);
    let out = false;
    for (let i = 0; i < 40 && !out; i++) out = stepBar(b, 0.05, 200 + i * 50);
    assert.ok(out, 'third life gone');
  });
});
