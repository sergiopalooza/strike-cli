# Strike-CLI by Appiphony
[![Latest NPM release][npm-badge]][npm-badge-url]

[npm-badge]: https://img.shields.io/npm/v/strike-cli.svg
[npm-badge-url]: https://www.npmjs.com/package/strike-cli

Get the Appiphony Strike Components into your Salesforce Organization through our CLI.
See our components here: http://www.lightningstrike.io

## Installation

	$ npm install strike-cli -g



### Available Strike Components
* Badge
* Chart
* Datepicker
* Lookup
* Modal
* Multi Select Picklist
* Select
* Textarea
* Tooltip


Usage
------------------------------------------------------------------------------

After installation the `strike` CLI tool will be available to you. You can call `strike --help` to find out more about all of the available commands. It is recommended that you create a new directory and execute
`strike` commands inside of it.


### Create a Strike Badge Component

```
strike install strike_badge
```

This will prompt you for your Org credentials, and then download and create the specified component
for out Strike-Components repository.


### Save your credentials locally to avoid entering a username and password after every command

```
strike connect
```

This will create a db.json file in the current folder with the entered credentials.
Please use responsibly.


### Build the project

```
strike disconnect
```

To delete the saved credentials file and/or force the CLI to prompt for 
username and password next time




Credits
---
Strike CLI is developed and maintained by <a href="http://appiphony.com" target="_blank">Appiphony</a>.

Support & Contribution
---
Feedback, questions, and bugs can be posted on this repository. Pull requests will be carefully considered for open issues or proposed enhancements.

License
------------------------------------------------------------------------------
The Strike source code is licensed under the <a href="http://opensource.org/licenses/BSD-2-Clause" target="_blank">BSD 2-Clause License</a>