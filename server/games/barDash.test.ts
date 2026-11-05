import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BAR_END, DRINK_MS, LIVES, PUSH_BACK, arrivalsFor } from '../../shared/games/barDash';
import { newBar, pour, stepBar } from './barDash';

describe('Bar Dash', () => {
  it('everyone gets the same customers', () => {
    assert.deepEqual(arrivalsFor(3), arrivalsFor(3));
  });

  it('a served customer near the door is pushed out of it, and takes the glass with them', () => {
    const b = newBar(1);
    b.arrivals = [];
    b.customers = [{ bar: 2, x: 150, speed: 0 }];
    pour(b, 2, 0);
    for (let i = 0; i < 40; i++) stepBar(b, 0.05, i * 50);
    assert.equal(b.served, 1);
    assert.equal(b.customers.length, 0);
    assert.equal(b.glasses.length, 0);
  });

  it('one further in slides back, drinks, sends the empty back and comes on again', () => {
    const b = newBar(1);
    b.arrivals = [];
    b.customers = [{ bar: 2, x: 400, speed: 50 }];
    pour(b, 2, 0);
    let ms = 0;
    const until = (done: () => boolean) => {
      for (let i = 0; i < 400 && !done(); i++) stepBar(b, 0.05, (ms += 50));
    };
    until(() => b.served === 1);
    const slideTo = b.customers[0].slideTo!;
    assert.ok(Math.abs(slideTo - (b.customers[0].x - PUSH_BACK)) < 1);
    until(() => b.customers[0].drinkUntil !== undefined);
    assert.equal(b.customers[0].x, slideTo);
    assert.equal(b.glasses.length, 0, 'still drinking');
    // A second drink goes straight past someone drinking.
    pour(b, 2, ms);
    until(() => b.drinks.length === 0);
    assert.equal(b.served, 1);
    assert.equal(b.lives, LIVES - 1, 'it ran off the end');
    until(() => b.glasses.length === 1);
    assert.ok(ms >= DRINK_MS);
    const back = b.customers[0].x;
    until(() => b.customers[0].x > back + 20);
    until(() => b.glasses.length === 0);
    assert.equal(b.lives, LIVES - 1, 'caught');
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
