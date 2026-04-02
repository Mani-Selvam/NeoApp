const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/**
 * Call Python web scraper service
 * @param {string} url - The website URL to scrape
 * @returns {Promise<Object>} Scraped data in JSON format
 */
const scrapePythonService = async (url) => {
    return new Promise((resolve, reject) => {
        const pythonScriptPath = path.join(__dirname, "pythonWebScraper.py");

        // Verify Python script exists
        if (!fs.existsSync(pythonScriptPath)) {
            return reject(new Error("Python scraper script not found"));
        }

        // Spawn Python process
        const pythonProcess = spawn("python", [pythonScriptPath, url], {
            timeout: 20000, // 20 second timeout
            maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large responses
        });

        let output = "";
        let errorOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(output);
                    resolve(result);
                } catch (parseError) {
                    reject(
                        new Error(
                            `Failed to parse Python output: ${parseError.message}`,
                        ),
                    );
                }
            } else {
                reject(
                    new Error(
                        `Python script failed (exit code ${code}): ${errorOutput}`,
                    ),
                );
            }
        });

        pythonProcess.on("error", (err) => {
            reject(new Error(`Failed to spawn Python process: ${err.message}`));
        });
    });
};

module.exports = { scrapePythonService };
