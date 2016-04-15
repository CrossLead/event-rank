/// <reference path='../typings/main.d.ts' />;
import * as _ from 'lodash';
import { expect } from 'chai';
import { EventRank, Hash, g as gFunc, h as hFunc } from '../lib/index';
import util from '../lib/util/index';
import * as moment from 'moment';
import test from 'ava';

const { abs } = Math;

const expectVeryClose = (x: number, message?: string) => {
  return (y: number) => expect(abs(x - y), message).to.be.below(10e-8);
};

const sum = (args: number[]) => args.reduce(((a, b) => a + b), 0);

const modelTypes = ['baseline', 'reply'];

const startTime = moment().unix();

const oneDay = 24 * 60 * 60 * 1000;

// helper functions / variables for making test data
const a = 'a',
      b = 'b',
      c = 'c',
      d = 'd',
      e = 'e',
      event = (from: string, to: string, time: number) => {
        return {to, from, time: startTime + time * oneDay};
      };

// example graph from http://www.datalab.uci.edu/papers/linkkdd05-02.pdf
const makeTestEvents = () => [
  event(b, c, 1),
  event(b, c, 2),
  event(b, c, 3),
  event(b, c, 4),
  event(d, b, 5),
  event(e, b, 5),
  event(b, a, 6),
  event(d, b, 6),
  event(e, b, 6),
  event(b, a, 7),
  event(d, b, 7),
  event(e, b, 7),
  event(b, a, 8),
  event(d, b, 8),
  event(e, b, 8),
  event(b, a, 9)
];


test('Assert function should throw on false', () => {
  expect(util.assert).to.exist;
  expect(() => util.assert(false, 'throwing false')).to.throw(Error);
  expect(() => util.assert(true, 'no error')).to.not.throw(Error);
});

test('last function should produce last element of array', () => {
  expect(util.last).to.exist;
  expect(util.last([1, 2, 3]), 'should select util.last element').to.equal(3);
  expect(util.last([]), 'should produce undefined for empty array').to.equal(undefined);
});

test('gakError should throw error', () => {
  expect(() => util.gakError('test')).to.throw(Error);
});

test('ensureArray should wrap object with array if necessary', () => {
  expect(util.ensureArray(1), 'should wrap with array').to.be.an.instanceof(Array);
  expect(util.ensureArray([1]), 'passing array should succeed').to.be.an.instanceof(Array);
  expect(util.ensureArray([1])[0], 'should not wrap if already array').to.equal(1);
});

test('Send decay function should return expected values given parameters', () => {
  const Δts = 5,
        G = 5,
        expectedOutput = 0.5207411;

  expect(gFunc).to.exist;
  expectVeryClose(gFunc(Δts, G))(expectedOutput);
});


test('Recieve decay function should return expected values given parameters', () => {
  const Δtr = 5,
        H = 3,
        expectedOutput = 0.3149802;

  expect(hFunc).to.exist;
  expectVeryClose(hFunc(Δtr, H))(expectedOutput);
});

test('Serializing event rank should produce pojo that can be loaded back into EventRank', () => {
  const correspondents = ['a', 'b', 'c'];
  const e = new EventRank({ correspondents });
  const pojo = e.serialize();
  const json = JSON.stringify(pojo);
  const alt = new EventRank(JSON.parse(json));
  const altJson = JSON.stringify(alt.serialize());
  expect(json).to.equal(e.toJson());
  expect(altJson).to.equal(json);
});


test('Starting with no ranks, and not iterating, should produce ranks = |C|', () => {
  const correspondents = ['a', 'b', 'c'];
  const e = new EventRank({ correspondents });
  const { ranks } = e.serialize();

  expect(ranks).to.exist;

  const values = <number[]> _(ranks)
    .values()
    .pluck('value')
    .value();

  values.forEach(expectVeryClose(1 / 3));
  expectVeryClose(sum(values), 'values should sum to one')(1);
});

test('Calculates expected ranks (using buckets) for test data', () => {

  for (const model of modelTypes) {

    const G = oneDay; // recharge time
    const H = oneDay; // message half life
    const f = 0.8;
    const events = makeTestEvents();
    const correspondents = EventRank.getCorrespondents(events);
    const bucketed = EventRank.bucket(events);
    const getRankValues = (er: EventRank) => {
      return <number[]> _(er.ranks)
      .values()
      .pluck('value')
      .value();
    };

    // initialize EventRank Object
    const R = new EventRank({ G, H, f, correspondents, model });

    // starting ranks should automatically be calculated for t=0
    const startRanks = getRankValues(R);
    const [first, ...rest] = startRanks;
    expectVeryClose(sum(startRanks), `(${model} model) start ranks should sum to one`)(1);
    rest.forEach(value => expect(value, `(${model} model) start ranks should all be equal`)
      .to.equal(first));

    // test one iteration of events
    const firstBucket = bucketed.shift();
    expect(firstBucket.events[0].from).to.equal(b);
    expect(firstBucket.events[0].to).to.equal(c);
    R.step(firstBucket);
    R.done();
    const stepOneRanks = getRankValues(R);

    expectVeryClose(
      sum(stepOneRanks),
      `(${model} model) After one iteration, ranks should still sum to one`
    )(1);

    R.step(bucketed.shift()).done();

    const lastRanks = [a, b, c, d, e]
      .reduce((o, x) => (o[x] = R.ranks[x], o), <Hash<any>>{});

    const { value : bValue } = lastRanks['b'];
    const { value : cValue } = lastRanks['c'];

    expect(bValue, `(${model} model) d ∈ P_i should have same rank on first round`)
      .to.equal(cValue);

    [a, d, e].forEach(x => {
      const { value } = lastRanks[x];
      expect(value, `(${model} model) R(d ∉ P_i) < R(d ∈ P_i)`)
        .to.be.below(bValue);
    });

    R.step(bucketed).done();

    expect(R.ranks['a'].value, `(${model} model) R(a) > R(c)`)
      .to.be.above(R.ranks['c'].value);

  }

});
