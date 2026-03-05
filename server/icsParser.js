/**
 * Re-exports the shared ICS parser so both the server and browser code
 * use the same implementation with no duplication.
 */
export { parseICSData } from '../src/plugins/utils/icsParser.js'
