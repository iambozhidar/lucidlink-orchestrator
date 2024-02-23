// utils.js

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries the async execute function until it succeeds.
 * @param {number} intervalMs - The interval in milliseconds to wait between retries.
 * @param {Function} execute - An async function that returns a Promise.
 * @returns {Promise<*>} The resolved value of the execute function.
 */
async function retryUntilDone(intervalMs, execute) {
    while (true) {
        try {
            return await execute();
        } catch (error) {
            //TODO: when does this end and we consider it as a fatal error?
            await sleep(5000);
        }
    }
}

module.exports = { sleep, retryUntilDone };