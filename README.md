## EventRank

[![npm version](https://badge.fury.io/js/EventRank.svg)](http://badge.fury.io/js/EventRank)
[![Build Status](https://travis-ci.org/CrossLead/EventRank.svg?branch=master)](https://travis-ci.org/CrossLead/EventRank)

### Overview

#### Algorithms

- `EventRank` provides an implementation of the EventRank algorithm put forth by [O’Madadhain & Smyth, 2005](http://www.datalab.uci.edu/papers/linkkdd05-02.pdf).


### Installation

##### npm
```shell
npm install --save event-rank
```

##### bower
```shell
bower install --save event-rank
```

### Usage

To calculate EventRanks of `correspondents` involved in a series of `events` sorted by time...

```javascript

import { EventRank } from 'event-rank';

/**
  * Events should be an Array of objects of the form...
  *    { time: <Number>, to: <String|Array<String>>, from: <String> }
  * sorted by the time property.
  *
  * NOTE: default parameters assume time is in milliseconds since the epoch
  */
const events = [ /* Add events here... */ ];

const R = new EventRank({ events });

// compute EventRank values
R.compute();

console.log(R.ranks); // => { ranks... }


/**
  * To lazily compute a stream of events, call step()...
  *
  * Note, the model will need to be initially fed a set of
  * correspondents to track
  */

const correspondents = [
  // email address (or whatever is in the to/from properties of the events) 1...
  // email address 2...
];

const R = new EventRank({ correspondents });

eventStream.on('event', event => {
  R.step(event);
});

// if lazily computing, the ranks need to be finished by calling done();
R.done();

console.log(R.ranks); // => { ranks... }


/**
 * If 2 (or more) events can occur at the exact same time,
 * EventRank can process "bucketed" events...
 */

const correspondents = [
  // email address 1...
  // email address 2...
];

const R = new EventRank({ correspondents });

let bucket;
eventStream.on('event', event => {
  if (bucket && bucket.time !== event.time) {
    R.step(bucket);
    bucket = { events: [ event ], time: event.time };
  } else if (!bucket) {
    bucket = { events: [ event ], time: event.time };
  } else {
    bucket.events.push(event);
  }
});

// include last bucket...
R.step(bucket);

// if lazily computing, the ranks need to be finished by calling done();
R.done();

console.log(R.ranks); // => { ranks... }   
```
