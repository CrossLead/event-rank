/**
 * Utility helper functions
 */


/**
 * Wrap an item in an array if it is not already one
 *
 * @param  {any} [value]  Object to be wrapped
 * @return {Array<any>} array of object
 */
export function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}


/**
 * Get the last element from an array
 *
 * @param  {Array<any>} [arr]  Array of items
 * @return {any} Last element of given array
 */
export function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}


/**
 * Throw a library specific error
 *
 * @param  {String} [message] Error messagec
 * @param  {Object} [event] (optional) Event object
 * @return {undefined}
 */
export function eventRankError(message: string, event?: any): never {
  message = `event-rank | ${message}`;
  if (event) {
    const pretty = JSON.stringify(event, null, 2);
    message = `${message} | Last Processed Event: \n${pretty}`;
  }
  throw new Error(message);
}


export default {
  eventRankError,
  last,
  ensureArray
};
