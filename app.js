var jsforce = require('jsforce');
var conn = new jsforce.Connection();

var username = process.env.SF_STRIKE_USERNAME;
var password = process.env.SF_STRIKE_PASSWORD;


conn.login(username, password, function(err, res) {
	if (err) { return console.error(err); }
	conn.query('SELECT Id, Name FROM Account', function(err, res) {
    	if (err) { return console.error(err); }
    	console.log(res);
	});
});

createComponentName();

function createComponentName(){
	var date = new Date();
	var dateComponents = [
	    date.getSeconds(),
	    date.getMilliseconds()
	];

	var randomInt = dateComponents.join("");
	var componentName = 'Prototype_Component' + randomInt;
	console.log(componentName);

}
