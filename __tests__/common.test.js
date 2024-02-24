const {retryUntilDone} = require('../src/common');

// Mock successful and failing functions
const successfulAsyncFunction = jest.fn().mockResolvedValue('Success');
const failingAsyncFunction = jest.fn().mockRejectedValue(new Error('Fail'));

describe('retryUntilDone', () => {
    beforeEach(() => {
        // Clear mock call history before each test
        jest.clearAllMocks();
    });

    test('executes successfully on the first try', async () => {
        const result = await retryUntilDone(100, 3, 'Exceeded retries', successfulAsyncFunction);
        expect(result).toBe('Success');
        expect(successfulAsyncFunction).toHaveBeenCalledTimes(1);
    });

    test('retries until success', async () => {
        failingAsyncFunction
            .mockRejectedValueOnce(new Error('Fail')) // Fail on first call
            .mockRejectedValueOnce(new Error('Fail')) // Fail on second call
            .mockResolvedValueOnce('Success'); // Succeed on third call

        const result = await retryUntilDone(100, 3, 'Exceeded retries', failingAsyncFunction);
        expect(result).toBe('Success');
        expect(failingAsyncFunction).toHaveBeenCalledTimes(3);
    });

    test('exceeds max retries and throws error', async () => {
        await expect(retryUntilDone(100, 2, 'Exceeded retries', failingAsyncFunction))
            .rejects
            .toThrow('Exceeded retries');
        expect(failingAsyncFunction).toHaveBeenCalledTimes(2);
    });

    test('honors the retry interval', async () => {
        const mockExecute = jest.fn()
            .mockRejectedValueOnce(new Error('Fail')) // Fail on first call
            .mockRejectedValueOnce(new Error('Fail')) // Fail on second call
            .mockResolvedValue('Success'); // Succeed on third call

        const startTime = Date.now();
        await retryUntilDone(1000, 5, 'Exceeded retries', mockExecute);
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;

        // Check if the elapsed time is >= specified interval * the number of failed calls,
        // indicating that the function waited between retries.
        expect(elapsedTime).toBeGreaterThanOrEqual(2000);
        expect(mockExecute).toHaveBeenCalledTimes(3);
    });
});