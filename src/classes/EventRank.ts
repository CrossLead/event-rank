/**
 * EventRank implementation
 *
 * Model adapted from "EventRank: A Framework for Ranking Time-Varying Networks"
 * (O’Madadhain & Smyth, 2005), utilizes 'Reply Model' of potential weights
 *
 * PDF: http://www.datalab.uci.edu/papers/linkkdd05-02.pdf
 */
import { eventRankError, ensureArray } from '../util/index';

declare var console: any;

export type EventItem = {
  time: number;
  to?: string | string[];
  from?: string;
  events?: EventItem[];
}

export type Rank = {
  value: number;
  time: number;
};


export type TimeUpdate = Hash<{
  recieved?: Hash<number>;
  sent?: number;
}>;


export type Bucket = {
  time: number,
  events: EventItem[]
}


export type Hash<T> = { [key: string]: T };


export type EventRankOptions = {
  correspondents: string[]; // list of ids invoved in events
  ranks?: Hash<Rank> // computed ranks so far
  events?: EventItem[]; // list events associated with ranking algorithm
  correspondanceMatrix?: CorrespondanceMatrix; // tracks send/recive times
  model?: string;  // model type = 'baseline' || 'reply'
  G?: number; // sender recharge parameter (reply model)
  H?: number;  // reply halflife parameter (reply model)
  f?: number; // potential flow fraction
  include?: Set<string>;
};


export type CorrespondanceMatrix = Hash<{
  lastUpdate?: number;
  sent?: number;
  recieved?: Hash<number>;
}>;


const { PI: π, tanh, pow } = Math;
const oneDay = 24 * 60 * 60 * 1000; // one day in milliseconds
const modelTypes = new Set(['baseline', 'reply']);


/**
 * Decay function for influence on potential of event sent by sender s ∈ P_i
 *  using time since event sent from s
 */
export function g(Δts: number, G: number) {
  return (tanh((10 * Δts) / (G * π) - π) + 1) / 2;
}



/**
 * Decay function for influence on potential of event sent by sender s ∈ P_i
 *  using time since last event recieved by r ∈ P_i from s
 */
export function h(Δtr: number, H: number) {
  return pow(2, (-Δtr) / H);
}


/**
 * Event Rank instance
 */
export class EventRank {

  /**
   * Create set of unique correspondents involved in all events
   */
  static getCorrespondents(events: EventItem[]) {
    const outSet = new Set();

    for (let i = 0, l = events.length; i < l; i++) {
      const event = events[i],
            to = event.to || [];

      outSet.add(event.from);

      for (let t = 0, lt = to.length; t < lt; t++) {
        outSet.add(to[t]);
      }
    }

    return Array.from(outSet);
  }


  /**
   * Compute starting ranks of given correspondents
   * @example
   * const ranks = EventRank.startRanks(['a', 'b', 'c'])
   * // => {a: {value: 0.3333333333, time: 0}, ...}
   */
  static startRanks(correspondents: string[]) {
    const value = 1 / correspondents.length,
          time = 0;
    return <Hash<Rank>> correspondents.reduce(
      (o, c) => (o[c] = { value, time }, o), <Hash<Rank>>{});
  }



  /**
   * Collapse times into buckets
   */
   static bucket(events: EventItem[]) {
     const hash = <Hash<EventItem[]>> {};

     let currentBucket: EventItem[];

     for (let i = 0, l = events.length; i < l; i++) {
       const event = events[i];
       if (currentBucket = hash[event.time]) {
         currentBucket.push(event);
       } else {
         hash[event.time] = [event];
       }
     }

     const times = Object.keys(hash).map(time => parseInt(time, 10));
     times.sort();
     return times.map(time => ({time, events: hash[time]}));
   }



  correspondents: string[] = [];
  correspondanceMatrix: CorrespondanceMatrix;
  include: Set<string>;
  events: EventItem[];
  ranks: Hash<Rank>;
  Vα: Rank[];
  G: number;
  H: number;
  f: number;
  model: string;
  timeUpdates: TimeUpdate;


  /**
   * Construct EventRank object
   */
  constructor(opts: EventRankOptions) {

    // default options
    const {
      G = oneDay,
      H = oneDay,
      f = 0.8,
      model = 'reply',
      events = <EventItem[]> [],
      include
    } = opts;

    if (!modelTypes.has(model)) {
      eventRankError(`Assertion failed: Unexpected model type: ${model}`);
    }

    // get ranks if passed
    let { ranks, correspondents, correspondanceMatrix } = opts;

    if (!correspondents && events) {
      correspondents = EventRank.getCorrespondents(events);
    }

    // start ranks for all = |C| if not present
    if (!ranks && correspondents) {
      ranks = EventRank.startRanks(correspondents);
    }

    // add properties
    Object.assign(this, {
      G, H, f, model,
      correspondents,
      correspondanceMatrix,
      events,
      ranks,
      Vα : []
    });

    if (!correspondanceMatrix) {
      this.resetCorrespondanceMatrix();
    }

    this.setInclude(include);
    this.correspondents = this.correspondents.filter(this.include.has.bind(this.include));
  }


  resetCorrespondanceMatrix() {
    this.correspondanceMatrix = <CorrespondanceMatrix> this.correspondents
      .reduce((o, c) => (o[c] = {}, o), <Hash<any>>{});
  }


  /**
   * Create the inclusion set for ranking
   */
  setInclude(include?: Set<string> | string[]) {
    include = include || this.correspondents;

    if (!(Array.isArray(include) || (include instanceof Set))) {
      eventRankError(`include needs to be a Set or an Array, but got: ${include}`);
    }

    this.include = new Set(include);
    return this;
  }


  /**
   * Package EventRank in pojo for serializing / db storage
   */
  serialize() {
    const out: Hash<any> = {},
          thisObject = <any> this;

    for (const prop in thisObject) {
      let p: any;
      if (!((p = thisObject[prop]) instanceof Function)) {
        out[prop] = p instanceof Set ? Array.from(p) : p;
      }
    }

    return <Hash<any>> out;
  }



  /**
   * Json string of serialized EventRank
   */
  toJson(pretty?: boolean) {
    return pretty
      ? JSON.stringify(this.serialize(), null, 2)
      : JSON.stringify(this.serialize());
  }


  /**
   * Log current ranks to console
   */
  log() {
    console.log(this.ranks);
    return this;
  }


  /**
   * Reset model to starting ranks
   *
   * @return {EventRank} this : return self for chaining
   */
  reset() {
    this.setInclude(
      (this.include && this.include.size)
          ? this.include
          : this.correspondents
    );

    this.correspondents = this.correspondents.filter(this.include.has.bind(this.include));

    this.correspondanceMatrix = <CorrespondanceMatrix> this.correspondents
      .reduce((o, c) => (o[c] = {}, o), <Hash<any>>{});

    this.ranks = EventRank.startRanks(this.correspondents);
    return this;
  }


  /**
   * Reset model to starting ranks and compute ranks over all events
   *
   * @return {EventRank} this : return self for chaining
   */
  compute() {
    return this.reset()
      .step(this.events)
      .done();
  }



  /**
   * Get ranks of top n individuals
   *
   * @param {Number} [n] number of ranks to report (from top)
   * @return {Array<Object>} top n ranks
   */
  top(n: number) {
    const ranks: { id: string, value: number, time: number }[] = [];
    for (const id in this.ranks) {
      ranks.push(Object.assign({ id }, this.ranks[id]));
    }
    ranks.sort((a, b) => b.value - a.value);
    return ranks.slice(0, n);
  }



  /**
   * Get ranks of given ids at current period
   *
   * @param {Array<String>} [ids] combination of str and array<str> of ids
   * @return {Array<Object>} ranks of (ids) at current period
   */
  get(...ids: string[]) {
    // catchup these individuals
    this.catchUp(ids);
    return ids.map(id => (Object.assign({ id }, this.ranks[id])));
  }



  /**
   * Ranks of individuals who were not participants in the previous event
   * need to be updated, apply a non-participant rank adjustment
   * for each period:
   *      d ∉ P_i :    R_i(d) = R_i-1(d) * (1 - (α_i / Tn_i))
   *
   * @example
   * const R = new EventRank({correspondents: ['a', 'b', 'c']});
   * R.step({from: 'a', to: 'b', time: 1});
   * R.catchUp('c') // catch c ranks to period 1
   *
   * @param  {String | Array<String>} [participant] id(s) of participant to "catch up"
   * @return {EventRank} this : return self for chaining
   */
  catchUp(participant: string | string[]) {

    if (typeof participant === 'string') {

      const { correspondanceMatrix: CM, ranks, Vα } = this;
      const iα = Vα.length,
            rank = ranks[participant];

      let i = CM[participant].lastUpdate || 0;

      while (i < iα) {
        const αLag = Vα[i++];
        rank.value *= (1 - αLag.value);
        rank.time = αLag.time;
      }

      // update index of last update
      CM[participant].lastUpdate = iα;
      return this;
    } else {
      for (let i = 0, l = participant.length; i < l; i++) {
        this.catchUp(participant[i]);
      }
      return this;
    }

  }



  /**
   * "Catch up" all correspondents to current period
   *
   * @return {EventRank} this : return self for chaining
   */
  done() {
    return this.catchUp(this.correspondents);
  }


  isBucket(b: any): b is Bucket {
    return b && b.time && Array.isArray(b.events);
  }


  /**
   * Calculate new ranks given an additional event
   *
   * @param  {Object | Array<Object>} [event] to add
   * @param  {String} [bucket] (optional) bucketMode option (capture | apply)
   * @return {EventRank} return self for chaining
   */
  step(event: EventItem | EventItem[] | Bucket, bucket?: 'capture' | 'apply') {

    // if event is acutally an array of events, step through all
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        this.step(event[i]);
      }
      return this;
    } else {

      // if event is an event bucket run through time bucket
      if (this.isBucket(event)) {
        const events = event.events,
              n = event.events.length - 1;

        for (let i = 0, l = events.length; i < l; i++) {
          this.step(events[i], i !== n ? 'capture' : 'apply');
        }
        return this;
      }

      // capture or apply time updates for bucket
      const capture  = bucket === 'capture';
      const apply    = bucket === 'apply';
      const isBucket = capture || apply;
      const watching = <typeof Set.prototype.has> this.include.has.bind(this.include);

      // unpack model weight parameters + ranks + correspondents
      const {
        G, H, f,
        ranks,
        correspondanceMatrix : CM,
        model,
        Vα
      } = this;

      // unpack event, create set of participants
      const { to = [], from : sender, time } = event;

      // if the sender is not in the include set, skip
      if (!watching(sender)) {
        return this;
      }

      // set of participants (only include those in "include")
      const recipients = new Set(ensureArray(to).filter(watching));

      if (!sender) return eventRankError('no sender in event!', event);
      if (!to.length) return eventRankError('no recipients of event!', event);
      if (!time) return eventRankError('no recorded time (or time === 0)!', event);

      // if the sender sends themself an email...
      recipients.delete(sender);

      // if the message was from A -> A, skip
      if (recipients.size === 0) {
        return this;
      }

      let timeUpdates: TimeUpdate | undefined;
      if (isBucket) {
        timeUpdates = this.timeUpdates = this.timeUpdates || <TimeUpdate> {};
        timeUpdates[sender] = timeUpdates[sender] || {recieved: {}};
      } else {
        delete this.timeUpdates;
      }

      // get array from recipient set
      const recipientArray = Array.from(recipients);

      // counts of participants + total correspondents
      const nP = recipients.size + 1;

      // catch up recipients with lazy ranks
      this.catchUp(sender);
      this.catchUp(recipientArray);

      // time differentials (for reply model)
      let Δts: number = -1,
          Δtr: number = -1;

      if (model === 'reply') {

        // Last time an email was sent by this sender
        // default to infinite time if no recorded emails sent by sender
        const lagSender = CM[sender];
        Δts = time - (lagSender.sent || -Infinity);

        // record current time as most recent send event by sender
        if (isBucket && timeUpdates) {
          timeUpdates[sender].sent = time;
        } else {
          lagSender.sent = time;
        }

        // Find the most recent time a message was recieved by the sender
        // from any of P_i, start at infinity (if no messages
        // recieved by sender from any of P_i)
        let trMin = -Infinity,
            trRecipient: number;

        for (let i = 0, l = recipientArray.length; i < l; i++) {
          const recipient = recipientArray[i],
                tr = lagSender.recieved = lagSender.recieved || {};

          if ((trRecipient = tr[recipient]) && trRecipient > trMin) {
            trMin = trRecipient;
          }

          // if processing bucket, don't apply time updates
          // until all events in bucket have been processed
          if (isBucket && timeUpdates) {
            const s = timeUpdates[sender];
            if (s && s.recieved) s.recieved[recipient] = time;
          } else {
            tr[recipient] = time;
          }
        }

        // time difference (recipient) is
        // between now and minimum determined time above
        Δtr = time - trMin;

        if (Δts < 0) {
          console.log(sender, CM[sender], time);
        }

        // assert that time differentials are not negative
        // (can't send/recieve messages in the future!)
        if (!(Δts >= 0)) return eventRankError(`Δts must not be negative: Δts = ${Δts}`, event);
        if (!(Δtr >= 0)) return eventRankError(`Δtr must not be negative: Δtr = ${Δtr}`, event);
      }

      // start sum with sender rank
      let ΣR = ranks[sender].value;

      // build up sum of all participant ranks
      for (let i = 0, l = recipientArray.length; i < l; i++) {
        ΣR += ranks[recipientArray[i]].value;
      }

      // Safety check to ensure that the sum should be within (0, 1)
      // not exact due to floating point issues...
      if (!(ΣR <= 1.000000000000009 && ΣR >= 0)) {
        return eventRankError(`ΣR must be in (0, 1): ΣR = ${ΣR}`, event);
      }

      if (ΣR > 1) {
        ΣR = 1;
      }

      // current total of non participants is one minus participent potential
      const Tn = 1 - ΣR;

      // potential transfer weight (with Tn factored out)
      let α: number;
      if (model === 'reply') {
        // reply model includes time weighting functions
        Vα.push({
          value : (α = f * g(Δts, G) * h(Δtr, H)), // calculate α for below
          time // save time of α calculation
        });
      } else {
        Vα.push({ value: (α = f), time });
      }
      // Tn is factored out from α above, as cases when Tn == 0
      // cause division by 0 issues, so we need to multiply it back in here
      α *= Tn;

      // safety check for bounds of α
      if (!(α <= 1 && α >= 0)) return eventRankError(`α must be in (0, 1): α = ${α}`, event);

      // sum of additive inverse of ranks of participants
      const ΣRbar = nP - ΣR;

      // store last index of alpha
      const iαNew = Vα.length;

      recipientArray.push(sender);
      for (let i = 0, l = recipientArray.length; i < l; i++) {
        const participant = recipientArray[i],
              rank = ranks[participant];

        let value = rank.value;

        // update participant rank for this period
        value += α * ((1 - value) / ΣRbar);

        // update index of last update
        CM[participant].lastUpdate = iαNew;

        // push new rank with given time
        rank.value = value;
        rank.time = time;
      }

      // apply time updates for bucket of events
      if (apply && timeUpdates) {
        for (const id in timeUpdates) {
          const up = timeUpdates[id],
                cmS = CM[id];

          cmS.recieved = cmS.recieved || {};
          cmS.sent = up.sent;

          if (!(up && up.recieved)) continue;

          for (const rid in up.recieved) {
            cmS.recieved[rid] = up.recieved[rid];
          }
        }
        delete this.timeUpdates;
      }

      return this;

    }

  }

}
