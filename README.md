# Controversy Checker

Controversy Checker is a web application that allows users to search for a person's name and checks for any controversies related to that person by scraping news articles. The app analyzes the content of the articles to determine the controversy score, severity, and type of controversy. It then displays the results to the user, including a summary and detailed information about the articles found.

## Features

- Search for a person's name to check for controversies
- Analyze news articles for controversy score, severity, and type
- Display results with a summary and detailed information
- Export results to a JSON file

## Live Demo

You can access the live demo of the application [here](https://controversy-checker-production.up.railway.app/).

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/sourabhkumarsahu/controversy-checker.git
    cd controversy-checker
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Start the server:
    ```sh
    npm start
    ```
   

4. Open your browser and navigate to `http://localhost:3001`.

## Configuration

The application uses a `config.json` file for configuration. Here is an example of the `config.json` file:
```json
{
  "apiPort": 3001,
  "startTime": "2025-02-25 11:29:15",
  "user": "SKSsearchtap"
}