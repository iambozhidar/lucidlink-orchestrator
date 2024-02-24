// common.js

const AWS_REGION = process.env.AWS_REGION;

class InstanceResults {
    constructor(creationTimeMs, copyTimeMs, deletionTimeMs) {
        this.creationTimeMs = creationTimeMs;
        this.copyTimeMs = copyTimeMs;
        this.deletionTimeMs = deletionTimeMs;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries the async execute function until it succeeds.
 * @param {number} intervalMs - The interval in milliseconds to wait between retries.
 * @param {number} maxRetries - The maximum retries for the execute function. Error is thrown if exceeded.
 * @param {string} errorMessage - The error message to add in the Error if the maxRetries are exceeded.
 * @param {Function} execute - An async function that returns a Promise.
 * @returns {Promise<*>} The resolved value of the execute function.
 */
async function retryUntilDone(intervalMs, maxRetries, errorMessage, execute) {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            return await execute();
        } catch (error) {
            attempts++;
            await sleep(intervalMs);
        }
    }
    // max retries exceeded
    throw new Error(`Operation failed after ${attempts} attempts: ${errorMessage}`);
}

module.exports = {AWS_REGION, InstanceResults, retryUntilDone};