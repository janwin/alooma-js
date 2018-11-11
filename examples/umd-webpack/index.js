var alooma = require('../../build/alooma.umd.js');

alooma.init("FAKE_TOKEN", {
    api_host: "",
    debug: true,
    loaded: function() {
        alooma.track('loaded() callback works but is unnecessary');
        alert("Alooma loaded successfully via Webpack/UMD");
    }
});

alooma.track('Tracking after alooma.init');
