(function() {

var alooma; // don't use window.alooma, use instance passed to integration_test_alooma()
var integration_test_token;
var integration_test_endpoint;

var old_onload = window.onload;
var old_handler_run = false;
window.onload = function() {
    if (old_onload) old_onload.call(window);
    old_handler_run = true;
    return true;
};

var _jsc = [];
var mpmodule = function(module_name, extra_setup, extra_teardown) {

    module(module_name, {
        setup: function() {
            this.token = integration_test_token;
            this.id = rand_name();

            alooma.init(
              integration_test_token,
              { api_host: integration_test_endpoint, track_pageview: false, debug: true },
              "integration_test");
            _.each(_jsc, function(key) {
                alooma.integration_test._jsc[key] = function() {};
            });

            if (extra_setup) { extra_setup.call(this); }
        },
        teardown: function() {
            // When we tear this down each time we lose the callbacks.
            // We don't always block on .track() calls, so in browsers where
            // we can't use xhr, the jsonp query is invalid. To fix this,
            // we save the keys but make the callbacks noops.
            if (alooma.integration_test) {
                _jsc = _.uniq(_jsc.concat(_.keys(alooma.integration_test._jsc)));
                clearLibInstance(alooma.integration_test);
            }

            // Necessary because the alias tests can't clean up after themselves, as there is no callback.
            _.each(document.cookie.split(';'), function(c) {
                var name = c.split('=')[0].replace(/^\s+|\s+$/g, '');
                if (name.match(/mp_test_\d+_alooma$/)) {
                    if (window.console) {
                        console.log("removing cookie:", name);
                    }
                    cookie.remove(name);
                    cookie.remove(name, true);
                }
            });

            if (extra_teardown) { extra_teardown.call(this); }
        }
    });
};

var USE_XHR = (window.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest());
var xhrmodule = function(module_name) {
    mpmodule(module_name, function() {
        this.xhr = sinon.useFakeXMLHttpRequest();
        this.requests = [];
        this.xhr.onCreate = _.bind(function(req) { this.requests.push(req); }, this);
    }, function() {
        this.xhr.restore();
    });
}

function notOk(state, message) {
    equal(state, false, message);
};

function isUndefined(prop, message) {
    ok(typeof(prop) === "undefined", message);
}

function callsError(callback, message) {
    var old_error = console.error;

    console.error = function(msg) {
        ok(msg == 'Alooma error:', message);
    }

    callback(function() {
        console.error = old_error;
    });
}

function clearLibInstance(instance) {
    var name = instance.config.name;
    if (name === "alooma") {
        throw "Cannot clear main lib instance";
    }
    instance.persistence.clear();
    delete alooma[name];
}

var append_fixture = function(a) {
    $('#qunit-fixture').append(a);
}

var ele_with_class = function() {
    var name = rand_name();
    var class_name = "."+name;
    var a = $("<a></a>").attr("class", name).attr("href","#");
    append_fixture(a);
    return { e: a.get(0), class_name: class_name, name: name };
}

var form_with_class = function() {
    var name = rand_name();
    var class_name = "."+name;
    var f = $("<form>").attr("class", name);
    append_fixture(f);
    return { e: f.get(0), class_name: class_name, name: name };
}

var ele_with_id = function() {
    var name = rand_name();
    var id = "#" + name;
    var a = $("<a></a>").attr("id", name).attr("href","#");
    append_fixture(a);
    return { e: $(id).get(0), id: id, name: name };
}

var rand_name = function() {
    return "test_" + Math.floor(Math.random() * 10000000);
};

var clear_super_properties = function(inst) {
    (inst || alooma).persistence.clear();
};

// does obj a contain all of obj b?
var contains_obj = function(a, b) {
    return !_.any(b, function(val, key) {
        return !(a[key] === b[key]);
    });
};

var cookie = {
    exists: function(name) {
        return document.cookie.indexOf(name + "=") !== -1;
    },

    get: function(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
        }
        return null;
    },

    set: function(name, value, days, cross_subdomain) {
        var cdomain = "", expires = "";

        if (cross_subdomain) {
            var matches = document.location.hostname.match(/[a-z0-9][a-z0-9\-]+\.[a-z\.]{2,6}$/i)
            , domain = matches ? matches[0] : '';

            cdomain   = ((domain) ? "; domain=." + domain : "");
        }

        if (days) {
            var date = new Date();
            date.setTime(date.getTime()+(days*24*60*60*1000));
            expires = "; expires=" + date.toGMTString();
        }

        document.cookie = name+"="+encodeURIComponent(value)+expires+"; path=/"+cdomain;
    },

    remove: function(name, cross_subdomain) {
        cookie.set(name, '', -1, cross_subdomain);
    }
};

var untilDone = function(func) {
    var timeout = setTimeout(function() {
        ok(false, 'timed out');
        start();
    }, 5000);
    var interval;
    interval = setInterval(function() {
        func(function() {
            clearTimeout(timeout);
            clearInterval(interval);
            start();
        });
    }, 20);
};

function simulateEvent(element, type) {
    if (document.createEvent) {
        // Trigger for the good browsers
        var trigger = document.createEvent('HTMLEvents');
        trigger.initEvent(type, true, true);
        element.dispatchEvent(trigger);
    } else if (document.createEventObject) {
        // Trigger for Internet Explorer
        var trigger = document.createEventObject();
        element.fireEvent('on' + type, trigger);
    }
}

function simulateMouseClick(element) {
    if (element.click) { element.click(); }
    else {
        var evt = element.ownerDocument.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, element.ownerDocument.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
        element.dispatchEvent(evt);
    }
}

function date_to_ISO(d) {
    // YYYY-MM-DDTHH:MM:SS in UTC
    function pad(n) {return n < 10 ? '0' + n : n}
    return d.getUTCFullYear() + '-'
        + pad(d.getUTCMonth() + 1) + '-'
        + pad(d.getUTCDate()) + 'T'
        + pad(d.getUTCHours()) + ':'
        + pad(d.getUTCMinutes()) + ':'
        + pad(d.getUTCSeconds());
}

window.integration_test_async = function(alooma_test_lib) {
    /* Tests for async/snippet behavior (prior to load).
     * Make sure we re-order args, etc.
     */

    alooma = alooma_test_lib;

    var test1 = {
        id: "asjief32f",
        name: "bilbo",
        properties: null
    };

    alooma.push(function() {
        this.persistence.clear();
    });

    alooma.time_event('test');
    alooma.track('test', {}, function(response, data) {
        test1.properties = data.properties;
    });
    var lib_loaded = alooma.__loaded;
    alooma.identify(test1.id);
    alooma.name_tag(test1.name);

    // only run pre-load snippet tests if lib didn't finish loading before identify/name_tag calls
    if (!lib_loaded) {
        module("async tracking");

            asyncTest("priority functions", 3, function() {
                untilDone(function(done) {
                    if (test1.properties !== null) {
                        var p = test1.properties;
                        same(p.mp_name_tag, test1.name, "name_tag should fire before track");
                        same(p.distinct_id, test1.id, "identify should fire before track");
                        ok(!_.isUndefined(p.$duration), "duration should be set");
                        done();
                    }
                });
            });
    } else {
        var warning = 'alooma-js library loaded before test setup; skipping async tracking tests';
        $('#qunit-userAgent').after($('<div class="qunit-warning" style="color:red;padding:10px;">Warning: ' + warning + '</div>'));
    }
};


window.integration_test_alooma = function(alooma_test_lib, alooma_token, alooma_endpoint) {

/* Tests to run once the lib is loaded on the page.
 */
setTimeout( function() {

alooma = alooma_test_lib;
integration_test_token = alooma_token;
integration_test_endpoint = alooma_endpoint;

module("onload handler preserved");
    test("User Onload handlers are preserved", 1, function() {
        ok(old_handler_run, "Old onload handler was run");
    });

mpmodule("alooma.track");

    asyncTest("check callback", 1, function() {
        alooma.integration_test.track('test', {}, function(response) {
            same(response, 1, "server returned 1");
            start();
        });
    });

    asyncTest("check no property name aliasing occurs during minify", 1, function() {
        var ob = {};
        var letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        _.each(letters, function(l1) {
            ob[l1] = l1;
            _.each(letters, function(l2) {
                var pair = l1 + l2;
                ob[pair] = pair;
            });
        });

        var expect_ob = _.extend({}, ob);
        expect_ob.token = this.token;
        alooma.integration_test.track('test', ob, function(response) {
            deepEqual(ob, expect_ob, 'Nothing strange happened to properties');
            start();
        });
    });

    test("token property does not override configured token", 1, function() {
        var props = {token: "HOPE NOT"};
        var data = alooma.integration_test.track('test', props);
        same(data.properties.token, alooma.integration_test.get_config('token'), 'Property did not override token');
    });

    asyncTest("callback doesn't override", 1, function() {
        var result = [];
        alooma.integration_test.track('test', {}, function(response) {
            result.push(1);
        });
        alooma.integration_test.track('test', {}, function(response) {
            result.push(2);
        });

        untilDone(function(done) {
            function i (n) {
                return _.include(result, n);
            }

            if (i(1) && i(2)) {
                ok('both callbacks executed.');
                done();
            }
        });
    });

    test("ip is honored", 2, function() {
        alooma.integration_test.set_config({img: true});
        alooma.integration_test.track("ip enabled");

        var with_ip = $('img').get(-1);
        alooma.integration_test.set_config({ip: 0});
        alooma.integration_test.track("ip disabled");
        var without_ip = $('img').get(-1);

        ok(with_ip.src.indexOf('ip=1') > 0, '_send_request should send ip=1 by default');
        ok(without_ip.src.indexOf('ip=0') > 0, '_send_request should send ip=0 when the config ip=false');
    });

    test("properties on blacklist are not sent", 4, function() {
        alooma.integration_test.set_config({
            property_blacklist: ['$current_url', '$referrer', 'blacklisted_custom_prop']
        });

        var data = alooma.integration_test.track('test', {
            blacklisted_custom_prop: 'foo',
            other_custom_prop: 'bar'
        });

        isUndefined(data.properties.$current_url, 'Blacklisted default prop should be removed');
        isUndefined(data.properties.$referrer, 'Blacklisted default prop should be removed');
        isUndefined(data.properties.blacklisted_custom_prop, 'Blacklisted custom prop should be removed');
        same(data.properties.other_custom_prop, 'bar', 'Non-blacklisted custom prop should not be removed');
    });

    test("disable() disables all tracking from firing", 2, function() {
        stop(); stop();

        alooma.integration_test.disable();

        alooma.integration_test.track("event_a", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });

        alooma.integration_test.track("event_b", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });
    });

    test("disable([event_arr]) disables individual events", 3, function() {
        stop(); stop(); stop();

        // doing it in two passes to test the disable's concat functionality
        alooma.integration_test.disable(['event_a']);
        alooma.integration_test.disable(['event_c']);

        alooma.integration_test.track("event_a", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });

        alooma.integration_test.track("event_b", {}, function(response) {
            same(response, 1, "track should be successful");
            start();
        });

        alooma.integration_test.track("event_c", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });
    });

    // callsError may fail if there is no console, so we can't expect 2 tests
    test("img based tracking", function() {
        var initial_image_count = $('img').length
            , e1 = ele_with_class();

        stop();

        alooma.integration_test.set_config({img: true});
        alooma.integration_test.track("image tracking");

        if (window.console) {
            stop();
            callsError(function(restore_console) {
                alooma.integration_test.track_links(e1.class_name, "link_clicked");
                restore_console();
                start();
            }, "dom tracking should be disabled");
        }

        untilDone(function(done) {
            if (initial_image_count + 1 === $('img').length) {
                done();
            }
        });
    });

    test("should truncate properties to 255 characters", 7, function() {
        var long_string = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc.";
        var props = {
            short_prop: "testing 1 2 3"
            , long_prop: long_string
            , number: 2342
            , obj: {
                long_prop: long_string
            }
            , num_array: [1,2,3]
            , longstr_array: [long_string]
        };

        var data = alooma.integration_test.track(long_string, props);

        same(data.event.length, 255, "event name should be truncated");
        same(data.properties.short_prop, props.short_prop, "short string properties should not be truncated");
        same(data.properties.long_prop.length, 255, "long string properties should be truncated");
        same(data.properties.number, props.number, "numbers should be ignored");
        same(data.properties.obj.long_prop.length, 255, "sub objects should have truncated values");
        same(data.properties.num_array, props.num_array, "sub arrays of numbers should be ignored");
        same(data.properties.longstr_array[0].length, 255, "sub arrays of strings should have truncated values");
    });// truncate properties test

    test("should not truncate properties", 7, function() {
        alooma.integration_test.set_config({'truncate': Infinity});
        var long_string = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc.";
        var props = {
            short_prop: "testing 1 2 3"
            , long_prop: long_string
            , number: 2342
            , obj: {
                long_prop: long_string
            }
            , num_array: [1,2,3]
            , longstr_array: [long_string]
        };

        var data = alooma.integration_test.track(long_string, props);
        same(data.event.length, long_string.length, "event name should not be truncated");
        same(data.properties.short_prop, props.short_prop, "short string properties should not be truncated");
        same(data.properties.long_prop.length, long_string.length, "long string properties should not be truncated");
        same(data.properties.number, props.number, "numbers should be ignored");
        same(data.properties.obj.long_prop.length, long_string.length, "sub objects should not have truncated values");
        same(data.properties.num_array, props.num_array, "sub arrays of numbers should be ignored");
        same(data.properties.longstr_array[0].length, long_string.length, "sub arrays of strings should not have truncated values");
    });// no truncation test

    test("should truncate properties to custom length", 7, function() {
        var truncate_limit = 267;
        alooma.integration_test.set_config({'truncate': truncate_limit});
        var long_string = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc.";
        var props = {
            short_prop: "testing 1 2 3"
            , long_prop: long_string
            , number: 2342
            , obj: {
                long_prop: long_string
            }
            , num_array: [1,2,3]
            , longstr_array: [long_string]
        };

        var data = alooma.integration_test.track(long_string, props);
        same(data.event.length, truncate_limit, "event name should not be truncated");
        same(data.properties.short_prop, props.short_prop, "short string properties should be truncated to " + truncate_limit);
        same(data.properties.long_prop.length, truncate_limit, "long string properties should be truncated to " + truncate_limit);
        same(data.properties.number, props.number, "numbers should be ignored");
        same(data.properties.obj.long_prop.length, truncate_limit, "sub objects should have truncated values to " + truncate_limit);
        same(data.properties.num_array, props.num_array, "sub arrays of numbers should be ignored");
        same(data.properties.longstr_array[0].length, truncate_limit, "sub arrays of strings should have truncated values to " + truncate_limit);
    });// no truncation test

    test("should send screen properties", 2, function() {
        var data = alooma.integration_test.track('test', {});

        same(data.properties.$screen_height, screen.height);
        same(data.properties.$screen_width, screen.width);
    });

mpmodule("alooma.time_event", function () {
    this.clock = sinon.useFakeTimers();
}, function () {
    this.clock.restore();
});

    test("it sets $duration to the elapsed time between time_event and track", 1, function() {
        alooma.integration_test.time_event('test');
        this.clock.tick(123);
        var data = alooma.integration_test.track('test');
        same(data.properties.$duration, 0.123);
    });

mpmodule("json");

    test("basic", 2, function() {
        var o = 'str';
        var encoded = alooma._.JSONEncode(o);
        var expected = '"str"';
        ok(encoded, expected, "encoded string is correct");

        o = {'str': 'str', 2: 2, 'array': [1], 'null': null};
        encoded = alooma._.JSONEncode(o);
        var decoded = alooma._.JSONDecode(encoded);
        ok(_.isEqual(decoded, o), "roundtrip should be equal");
    });

    test("special chars", 2, function() {
        var o = '\b';
        var encoded = alooma._.JSONEncode(o);
        var valid = ['"\\b"', '"\\u0008"'];
        ok(_.indexOf(valid, encoded) >= 0, "encoded string is correct");

        var decoded = alooma._.JSONDecode(encoded);
        ok(_.isEqual(decoded, o), "roundtrip should be equal");
    });

if (!window.COOKIE_FAILURE_TEST) {
    mpmodule("cookies");

        test("cookie manipulation", 4, function() {
            var c = alooma._.cookie
                , name = "mp_test_cookie_2348958345"
                , content = "testing 1 2 3;2jf3f39*#%&*%@)(@%_@{}[]";

            if (cookie.exists(name)) {
                c.remove(name);
            }

            notOk(cookie.exists(name), "test cookie should not exist");

            c.set(name, content);

            ok(cookie.exists(name), "test cookie should exist");

            equal(c.get(name), content, "cookie.get should return the cookie's content");

            c.remove(name);

            notOk(cookie.exists(name), "test cookie should not exist");
        });

        test("cookie name", 4, function() {
            var token = integration_test_token
                , name1 = "mp_"+token+"_alooma"
                , name2 = "mp_cn2";

            ok(cookie.exists(name1), "default test cookie should exist");

            notOk(cookie.exists(name2), "test cookie 2 should not exist");

            alooma.init(token, { api_host: integration_test_endpoint, cookie_name: "cn2" }, "cn2");
            ok(cookie.exists(name2), "test cookie 2 should exist");

            alooma.cn2.cookie.clear();

            notOk(cookie.exists(name2), "test cookie 2 should not exist");

            clearLibInstance(alooma.cn2);
        });

        test("cross subdomain", 4, function() {
            var name = alooma.integration_test.config.cookie_name;

            ok(alooma.integration_test.cookie.get_cross_subdomain(), "Cross subdomain should be set correctly");
            // Remove non-cross-subdomain cookie if it exists.
            cookie.remove(name, false);
            ok(cookie.exists(name), "Cookie should still exist");

            alooma.integration_test.set_config({ cross_subdomain_cookie: false });
            notOk(alooma.integration_test.cookie.get_cross_subdomain(), "Should switch to false");
            // Remove cross-subdomain cookie if it exists.
            cookie.remove(name, true);
            ok(cookie.exists(name), "Cookie should still exist for current subdomain");
        });

        test("Old values loaded", 1, function() {
            var c1 = {
                distinct_id: '12345',
                asdf: 'asdf',
                $original_referrer: 'http://whodat.com'
            };
            var token = integration_test_token,
                name = "mp_" + token + "_alooma";

            // Set some existing cookie values & make sure they are loaded in correctly.
            cookie.remove(name);
            cookie.remove(name, true);
            cookie.set(name, alooma._.JSONEncode(c1));

            var ov1 = alooma.init(token, {api_host: integration_test_endpoint}, "ov1");
            ok(contains_obj(ov1.cookie.props, c1), "original cookie values should be loaded");
            clearLibInstance(alooma.ov1);
        });

        test("cookie upgrade", 12, function() {
            var c1 = {
                'all': { 'test': '7abc' },
                'events': { 'test2': 'ab8c' },
                'funnels': { 'test3': 'ab6c' }
            };

            // Set up a cookie with the name used by the old lib
            cookie.remove('mp_super_properties');
            cookie.remove('mp_super_properties', true);
            cookie.set('mp_super_properties', alooma._.JSONEncode(c1));

            var cu0 = alooma.init(integration_test_token, { api_host: integration_test_endpoint, upgrade: true }, "cu0");

            notOk(cookie.exists('mp_super_properties'), "upgrade should remove the cookie");

            ok(contains_obj(cu0.cookie.props, c1['all']), "old cookie[all] was imported");
            ok(contains_obj(cu0.cookie.props, c1['events']), "old cookie[events] was imported");
            notOk(contains_obj(cu0.cookie.props, c1['funnels']), "old cookie[funnels] was not imported");

            var c2 = {
                'all': { 'test4': 'a3bc' },
                'events': { 'test5': 'a2bc' },
                'funnels': { 'test6': 'a5bc' }
            };

            // Set up an old-style cookie with a custom name
            cookie.remove('mp_super_properties_other');
            cookie.remove('mp_super_properties_other', true);
            cookie.set('mp_super_properties_other', alooma._.JSONEncode(c2));

            var cu1 = alooma.init(integration_test_token, { api_host: integration_test_endpoint, upgrade: 'mp_super_properties_other' }, "cu1");

            notOk(cookie.exists('mp_super_properties_other'), "upgrade should remove the cookie");

            ok(contains_obj(cu1.cookie.props, c2['all']), "old cookie[all] was imported");
            ok(contains_obj(cu1.cookie.props, c2['events']), "old cookie[events] was imported");
            notOk(contains_obj(cu1.cookie.props, c2['funnels']), "old cookie[funnels] was not imported");

            var c3 = { 'a': 'b' }
                , token = integration_test_token
                , name = "mp_" + token + "_alooma"
                , old_name = "mp_" + token + "_cu2";

            cookie.remove(name);
            cookie.remove(name, true);
            cookie.remove(old_name);
            cookie.remove(old_name, true);

            // Set up a cookie with the tracker name appended, like this one used to.
            cookie.set(old_name, alooma._.JSONEncode(c3));

            var cu2 = alooma.init(token, {api_host: integration_test_endpoint}, 'cu2');

            // Old cookie should be removed when lib is initialized
            notOk(cookie.exists(old_name), "initializing a lib with a custom name should kill off the old name");
            ok(contains_obj(cu2.cookie.props, c3), "old cookie was imported");

            var c4 = { 'c': 'd' }
                , token = integration_test_token
                , name = "mp_" + token + "_alooma"
                , old_name = "mp_" + token + "_cu3";

            // Set the cookie the lib will set by default
            cookie.remove(name);
            cookie.remove(name, true);
            cookie.set(name, alooma._.JSONEncode(c4));

            // Reset the cookie with the tracker name appended
            cookie.remove(old_name);
            cookie.remove(old_name, true);
            // Set c value in old cookie - we want to test to make sure it doesn't override
            // the current one.
            cookie.set(old_name, alooma._.JSONEncode({ 'c': 'error' }));

            var cu3 = alooma.init(token, { api_host: integration_test_endpoint, upgrade: true }, 'cu3');

            notOk(cookie.exists(old_name), "initializing the lib should kill off the old one, even if the correct name exists");
            ok(contains_obj(cu3.cookie.props, c4), "old cookie should be imported");

            clearLibInstance(cu0);
            clearLibInstance(cu1);
            clearLibInstance(cu2);
            clearLibInstance(cu3);
        });

        test("disable cookies", 7, function() {
            var c_name = "mpl_should_not_exist";

            cookie.remove(c_name);
            cookie.remove(c_name, true);

            alooma.init(integration_test_token, { api_host: integration_test_endpoint, cookie_name: c_name, disable_cookie: true }, "dc0");

            notOk(cookie.exists(c_name), "cookie should not exist");

            var dc1 = alooma.init(integration_test_token, { api_host: integration_test_endpoint, cookie_name: c_name }, "dc1");
            dc1.set_config({ disable_cookie: true });

            notOk(cookie.exists(c_name), "cookie 2 should not exist");

            var props = { 'a': 'b' };
            dc1.register(props);

            stop();
            var data = dc1.track('test', {'c': 'd'}, function(response) {
                same(response, 1, "tracking still works");
                start();
            });

            var dp = data.properties;

            ok('token' in dp, "token included in properties");

            ok(contains_obj(dp, {'a': 'b', 'c': 'd'}), 'super properties included correctly');
            ok(contains_obj(dc1.cookie.props, props), "Super properties saved");

            notOk(cookie.exists(c_name), "cookie 2 should not exist even after tracking/registering");
        });

        function cookie_included(name, callback) {
            $.ajax({
              cache: false,
              url: "/tests/cookie_included/" + name,
              dataType: "json",
              success: function(resp) {
                  callback(resp);
              }
            });
        }

        asyncTest("secure cookie false by default", 1, function() {
            cookie_included(alooma.integration_test.cookie.name, function(resp) {
                same(resp, 1, "cookie is included in request to server");
                start();
            });
        });

        asyncTest("secure cookie only sent to https", 1, function() {
            alooma.integration_test.set_config({ secure_cookie: true });
            var expected = document.location.protocol === "https:" ? 1 : 0;

            cookie_included(alooma.integration_test.cookie.name, function(resp) {
                same(resp, expected, "cookie is only included in request to server if https");
                start();
            });
        });
}

if (window.localStorage) {
    mpmodule("localStorage");

        test("localStorage manipulation", 4, function() {
            var storage = alooma._.localStorage,
                name = "mp_test_storage",
                content = "testing 1 2 3;2jf3f39*#%&*%@)(@%_@{}[]";

            if (window.localStorage.getItem(name)) {
                storage.remove(name);
            }

            notOk(!!window.localStorage.getItem(name), "localStorage entry should not exist");

            storage.set(name, content);

            ok(!!window.localStorage.getItem(name), "localStorage entry should exist");

            equal(storage.get(name), content, "storage.get should return stored content");

            storage.remove(name);

            notOk(!!window.localStorage.getItem(name), "localStorage entry should not exist");
        });

        test("persistence name", 7, function() {
            var token = integration_test_token,
                name1 = "mp_" + token + "_alooma",
                name2 = "mp_sn2";

            notOk(!!window.localStorage.getItem(name1), "localStorage entry 1 should not exist");
            alooma.init(token, {api_host: integration_test_endpoint, persistence: 'localStorage'}, 'sn1');
            ok(!!window.localStorage.getItem(name1), "localStorage entry 1 should exist");

            notOk(!!window.localStorage.getItem(name2), "localStorage entry 2 should not exist");
            alooma.init(token, {api_host: integration_test_endpoint, persistence: 'localStorage', persistence_name: 'sn2'}, 'sn2');
            ok(!!window.localStorage.getItem(name2), "localStorage entry 2 should exist");
            ok(!!window.localStorage.getItem(name1), "localStorage entry 1 should still exist");

            alooma.sn1.persistence.clear();
            alooma.sn2.persistence.clear();

            notOk(!!window.localStorage.getItem(name1), "localStorage entry 1 should no longer exist");
            notOk(!!window.localStorage.getItem(name2), "localStorage entry 2 should no longer exist");

            clearLibInstance(alooma.sn1);
            clearLibInstance(alooma.sn2);
        });

        test("invalid persistence type", 2, function() {
            var token = integration_test_token,
                name = "mp_" + token + "_alooma";

            alooma.init(token, {api_host: integration_test_endpoint, persistence: 'blargh!!!'}, 'ipt1');
            notOk(!!window.localStorage.getItem(name), "localStorage entry should not exist");
            ok(cookie.exists(name), "Cookie should exist");

            clearLibInstance(alooma.ipt1);
        });

        test("disable persistence", 7, function() {
            var sname = "mpl_should_not_exist";
            window.localStorage.removeItem(sname);

            alooma.init(integration_test_token, {
                api_host: integration_test_endpoint,
                persistence: 'localStorage',
                persistence_name: sname,
                disable_persistence: true
            }, 'ds1');

            notOk(!!window.localStorage.getItem(sname), "localStorage entry should not exist");

            var ds2 = alooma.init(integration_test_token, {
                api_host: integration_test_endpoint,
                persistence: 'localStorage',
                persistence_name: sname
            }, 'ds2');
            ds2.set_config({disable_persistence: true});

            notOk(!!window.localStorage.getItem(sname), "localStorage entry should not exist");

            var props = {'a': 'b'};
            ds2.register(props);

            stop();
            var data = ds2.track('test', {'c': 'd'}, function(response) {
                same(response, 1, "tracking still works");
                start();
            });

            var dp = data.properties;

            ok('token' in dp, "token included in properties");

            ok(contains_obj(dp, {'a': 'b', 'c': 'd'}), 'super properties included correctly');
            ok(contains_obj(ds2.persistence.props, props), "Super properties saved");

            notOk(
                !!window.localStorage.getItem(sname),
                "localStorage entry should not exist even after tracking/registering"
            );
        });

        test("upgrade from cookie", 9, function() {
            // populate cookie
            var ut1 = alooma.init(integration_test_token, {api_host: integration_test_endpoint}, 'ut1'),
                persistence_name = 'mp_' + integration_test_token + '_alooma';
            ut1.register({'a': 'b'});
            ok(cookie.exists(persistence_name), "cookie should exist");

            // init same project with localStorage
            var ut2 = alooma.init(integration_test_token, {api_host: integration_test_endpoint, persistence: 'localStorage'}, 'ut2');
            ut2.register({'c': 'd'});
            ok(!!window.localStorage.getItem(persistence_name), "localStorage entry should exist");

            ok(contains_obj(ut2.persistence.props, {'a': 'b'}), "upgrading from cookie should import props");
            notOk(cookie.exists('mp_UT_TOKEN_alooma'), "upgrading from cookie should remove cookie");

            // send track request from upgraded instance
            stop();
            var data = ut2.track('test', {'foo': 'bar'}, function(response) {
                same(response, 1, "tracking still works");
                start();
            });

            var dp = data.properties;
            ok('token' in dp, "token included in properties");
            ok(contains_obj(dp, {'a': 'b'}), "super properties transferred correctly");
            ok(contains_obj(dp, {'c': 'd'}), "new super properties registered correctly");
            ok(contains_obj(dp, {'foo': 'bar'}), "tracking properties sent correctly");

            clearLibInstance(ut1);
            clearLibInstance(ut2);
        });

        test("upgrade from non-existent cookie", 5, function() {
            // populate cookie
            var persistence_name = 'upgrade_test2',
                full_persistence_name = 'mp_' + persistence_name;
            cookie.remove(full_persistence_name);

            var ut = alooma.init(integration_test_token, {
                api_host: integration_test_endpoint,
                persistence: 'localStorage',
                persistence_name: persistence_name
            }, 'ut2');
            ok(!!window.localStorage.getItem(full_persistence_name), "localStorage entry should exist");
            notOk(cookie.exists(full_persistence_name), "cookie should not exist");

            stop();
            var data = ut.track('test', {'foo': 'bar'}, function(response) {
                same(response, 1, "tracking still works");
                start();
            });

            var dp = data.properties;
            ok('token' in dp, "token included in properties");
            ok(contains_obj(dp, {'foo': 'bar'}), "tracking properties sent correctly");

            clearLibInstance(ut);
        });
}

mpmodule("alooma");

    test("constructor", window.COOKIE_FAILURE_TEST ? 2 : 3, function() {
        var token = integration_test_token,
            sp = { 'test': 'all' };

        alooma.init(token, { api_host: integration_test_endpoint, persistence_name: 'mpl_t2', track_pageview: false }, 'mpl');

        alooma.mpl.register(sp);
        ok(contains_obj(alooma.mpl.persistence.props, sp), "Super properties set correctly");

        // Recreate object - should pull super props from persistence
        alooma.init(token, { api_host: integration_test_endpoint, persistence_name: 'mpl_t2', track_pageview: false }, 'mpl2');
        if (!window.COOKIE_FAILURE_TEST) {
            ok(contains_obj(alooma.mpl2.persistence.props, sp), "Super properties saved to persistence");
        }

        alooma.init(token, { api_host: integration_test_endpoint, persistence_name: 'mpl_t', track_pageview: false }, 'mpl3');
        var props = alooma.mpl3.persistence.properties();
        delete props['distinct_id'];
        same(props, {}, "Super properties shouldn't be loaded from alooma persistence")

        clearLibInstance(alooma.mpl);
        clearLibInstance(alooma.mpl2);
        clearLibInstance(alooma.mpl3);
    });

    test("info properties included", 7, function() {
        var info_props = "$os $browser $current_url $browser_version $referrer $referring_domain mp_lib".split(' ');

        var data = alooma.integration_test.track("check info props");
        _.each(info_props, function(prop) {
            ok(prop in data.properties, "properties should include " + prop);
        });
    });

    test("initial referrers set correctly", 8, function() {
        var i_ref = "$initial_referrer",
            i_ref_d = "$initial_referring_domain",
            none_val = "$direct";

        // force properties to be created
        alooma.integration_test.track_pageview();

        ok(i_ref in alooma.integration_test.persistence.props, "initial referrer saved");
        ok(i_ref_d in alooma.integration_test.persistence.props, "initial referring domain saved");

        // Clear persistence so we can emulate missing referrer.
        alooma.integration_test.persistence.clear();
        alooma.integration_test.persistence.update_referrer_info("");

        // If referrer is missing, we want to mark it as None (type-in)
        ok(alooma.integration_test.persistence.props[i_ref] === none_val, "empty referrer should mark $initial_referrer as None");
        ok(alooma.integration_test.persistence.props[i_ref_d] === none_val, "empty referrer should mark $initial_referring_domain as None");

        var ref = "http://example.com/a/b/?c=d";
        // Now we update, but the vals should remain None.
        alooma.integration_test.persistence.update_referrer_info(ref);
        equal(alooma.integration_test.persistence.props[i_ref], none_val, "$inital_referrer should remain None, even after getting a referrer");
        equal(alooma.integration_test.persistence.props[i_ref_d], none_val, "$initial_referring_domain should remain None even after getting a referrer");

        // Clear persistence so we can try a real domain
        alooma.integration_test.persistence.clear();
        alooma.integration_test.persistence.update_referrer_info(ref);
        equal(alooma.integration_test.persistence.props[i_ref], ref, "Full referrer should be saved");
        equal(alooma.integration_test.persistence.props[i_ref_d], "example.com", "Just domain should be saved");
    });

    test("current url set correctly", 2, function() {
        var current_url = "$current_url";
        var event = alooma.integration_test.track("check current url");
        var props = event.properties;
        ok(current_url in props, "current url in props");
        equal(
          props[current_url],
          window.location.href.substring(0, alooma.integration_test.get_config('truncate')),
          "current url is properly set");
    });

    test("set_config", 2, function() {
        ok(!alooma.config.test, "test isn't set already");
        alooma.set_config({ test: 1 });
        ok(alooma.config.test == 1, "config is saved");
    });

    test("get_property", 2, function() {
        var prop = "test_get_property", value = "23fj22j09jdlsa";

        if (alooma.persistence.props[prop]) { delete alooma.persistence.props[prop]; }
        ok(typeof(alooma.get_property(prop)) === 'undefined', "get_property returns undefined for unset properties");

        alooma.register({ "test_get_property": value });
        ok(alooma.get_property(prop) === value, "get_property successfully returns the correct super property's value");
    });

    test("save_search_keyword", 8, function() {
        var test_data = [
            ["google", "http://www.google.com/#sclient=psy&hl=en&site=&source=hp&q=test&aq=f&aqi=g5&aql=f&oq=&pbx=1&bav=on.2,or.r_gc.r_pw.&fp=78e75b26b3ba4591"]
            , ["google", "http://www.google.ca/#sclient=psy&hl=en&biw=1200&bih=1825&source=hp&q=test&aq=f&aqi=g5&aql=&oq=&pbx=1&bav=on.2,or.r_gc.r_pw.&fp=ee961497a1bb4875"]
            , ["google", "http://www.google.be/#hl=nl&source=hp&biw=1200&bih=1794&q=test&oq=test&aq=f&aqi=g10&aql=&gs_sm=e&gs_upl=1808l2038l0l4l2l0l0l0l0l139l210l1.1&bav=on.2,or.r_gc.r_pw.&fp=e8b05776699ca8de"]
            , ["bing", "http://www.bing.com/search?q=test&go=&form=QBLH&qs=n&sk=&sc=8-4"]
            , ["bing", "http://be.bing.com/search?q=test&go=&form=QBLH&filt=all"]
            , ["yahoo", "http://search.yahoo.com/search;_ylt=A0oGdSBmkd1NN0AAivtXNyoA?p=test&fr2=sb-top&fr=yfp-t-701&type_param="]
            , ["yahoo", "http://ca.search.yahoo.com/search;_ylt=A0oGkmd_kd1NFzcAJGnrFAx.;_ylc=X1MDMjExNDcyMTAwMwRfcgMyBGFvAzEEZnIDeWZwLXQtNzE1BGhvc3RwdmlkAzRlMnVfVW9Ha3lraE5xTmRUYjlsX1FQcFJpU1NNazNka1g4QUF3YUIEbl9ncHMDMTAEbl92cHMDMARvcmlnaW4Dc3JwBHF1ZXJ5A3Rlc3QEc2FvAzEEdnRlc3RpZANNU1lDQUMx?p=test&fr2=sb-top&fr=yfp-t-715&rd=r1"]
            , ["duckduckgo", "http://duckduckgo.com/?q=test"]
        ];

        var props = {'mp_keyword': 'test', '$search_engine': ''};

        for (var i = 0; i < test_data.length; i++) {
            clear_super_properties();
            alooma.persistence.update_search_keyword(test_data[i][1]);
            props["$search_engine"] = test_data[i][0];
            same(alooma.persistence.props, props, "Save search keyword parses query " + i);
        }
    });

mpmodule("super properties");

    var get_props_without_distinct_id = function(instance) {
        return _.omit(instance.persistence.properties(), 'distinct_id');
    };

    test("register", 2, function() {
        var props = {'hi': 'there'},
            persisted_props = get_props_without_distinct_id(alooma.integration_test);

        same(persisted_props, {}, "empty before setting");

        alooma.integration_test.register(props);

        same(get_props_without_distinct_id(alooma.integration_test), props, "properties set properly");
    });

    test("register_once", 3, function() {
        var props = {'hi': 'there'},
            props1 = {'hi': 'ho'}

        same(get_props_without_distinct_id(alooma.integration_test), {}, "empty before setting");

        alooma.integration_test.register_once(props);

        same(get_props_without_distinct_id(alooma.integration_test), props, "properties set properly");

        alooma.integration_test.register_once(props1);

        same(get_props_without_distinct_id(alooma.integration_test), props, "register_once doesn't override already set super property");
    });

    test("identify", 1, function() {
        alooma.integration_test.identify(this.id);
        same(alooma.integration_test.get_distinct_id(), this.id);
    });

    test("name_tag", 2, function() {
        var name_tag = "fake name";
        same(get_props_without_distinct_id(alooma.integration_test), {}, "empty before setting");

        alooma.integration_test.name_tag(name_tag);
        same(get_props_without_distinct_id(alooma.integration_test), { 'mp_name_tag': name_tag }, "name tag set");
    });

    test("super properties included", 2, function() {
        var props = { 'a': 'b', 'c': 'd' };
        alooma.integration_test.register(props);

        var data = alooma.integration_test.track('test');
        var dp = data.properties;

        ok('token' in dp, "token included in properties");

        ok(contains_obj(dp, props), 'super properties included correctly');
    });

    test("super properties overridden by manual props", 2, function() {
        var props = { 'a': 'b', 'c': 'd' };
        alooma.integration_test.register(props);

        var data = alooma.integration_test.track('test', {'a': 'c'});
        var dp = data.properties;

        ok('token' in dp, "token included in properties");

        ok(contains_obj(dp, {'a': 'c', 'c': 'd'}), 'super properties included correctly');
    });

module("alooma.track_links");

    asyncTest("callback test", 1, function() {
        var e1 = ele_with_class();

        alooma.track_links(e1.class_name, "link_clicked", {"property": "dodeo"}, function() {
            start();
            ok(1===1, "track_links callback was fired");
            return false; // this stops the browser from going to the link location
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("callbacks are preserved", 1, function() {
        var e1 = ele_with_class();

        var old_was_fired = false;

        e1.e.onclick = function() {
            old_was_fired = true;
            return false;
        };

        alooma.track_links(e1.class_name, "link_clicked", {"property": "it works"}, function() {
            start();
            ok(old_was_fired, "Old event was fired, and new event was fired");
            return false;
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("supports changing the timeout", 3, function() {
        var e1 = ele_with_class();

        same(alooma.config.track_links_timeout, 300, "track_links_timeout defaults to a sane value");
        alooma.set_config({"track_links_timeout": 1000});
        same(alooma.config.track_links_timeout, 1000, "track_links_timeout can be changed");

        // setting it to 1 so the callback fires right away
        alooma.set_config({"track_links_timeout": 1});
        alooma.track_links(e1.class_name, "do de do", {}, function(timeout_occured) {
            ok(timeout_occured, "track_links_timeout successfully modified the timeout");
            alooma.set_config({"track_links_timeout": 300});
            start();
            return false;
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("adds a url property to events", 1, function() {
        var e1 = ele_with_class();

        e1.e.href = "#test";
        alooma.track_links(e1.class_name, "testing url property", {}, function(timeout_occured, properties) {
            ok(properties.url !== undefined && properties.url !== null, "Url property was successfully added");
            start();
            return false;
        });

        simulateMouseClick(e1.e);
    });

    // callsError may fail if there is no console, so we can't expect 1 tests
    test("gracefully fails on invalid query", function() {
        var e1 = ele_with_id(),
            e2 = ele_with_id();

        alooma.track_links("a" + e1.id, "this should work");

        if (window.console) {
            stop();
            callsError(function(restore_console) {
                alooma.track_links("a#badbadbadid", "this shouldn't work");
                restore_console();
                start();
            }, "terrible query should not throw exception");
        }
    });

    test("dom selection library handles svg object className's", 1, function() {
        var name = rand_name(),
            svg = $('<svg width="300" height="100" class="' + name + '"><text class=".label" x="200" y="30">Test</text></svg>');
        append_fixture(svg);

        try {
            alooma.track_links('.test', "this should not fire an error");
            ok(true);
        } catch (err) {
            if (/TypeError/.exec(err)) {
                ok(false, "shouldn't throw a type error");
            } else {
                throw err;
            }
        }

        svg.remove();
    });

module("alooma.track_forms");

    asyncTest("callback test", 1, function() {
        var e1 = form_with_class();

        alooma.track_forms(e1.class_name, "form_submitted", {"property": "dodeo"}, function() {
            start();
            ok(1===1, "track_forms callback was fired");
            return false; // this stops the browser from going to the link location
        });

        simulateEvent(e1.e, 'submit');
    });

    asyncTest("supports changing the timeout", 3, function() {
        var e1 = form_with_class();

        same(alooma.config.track_links_timeout, 300, "track_links_timeout defaults to a sane value");
        alooma.set_config({"track_links_timeout": 1000});
        same(alooma.config.track_links_timeout, 1000, "track_links_timeout can be changed");

        // setting it to 1 so the callback fires right away
        alooma.set_config({"track_links_timeout": 1});
        alooma.track_forms(e1.class_name, "do de do", {}, function(timeout_occured) {
            start();
            ok(timeout_occured, "track_links_timeout successfully modified the timeout (track_forms)");
            alooma.set_config({"track_links_timeout": 300});
            return false;
        });

        simulateEvent(e1.e, 'submit');
    });

mpmodule("alooma.alias");
    var __alias = "__alias";

    test("alias sends an event", 2, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            new_id = this.id;

        var ev = alooma.integration_test.alias(new_id);

        notOk(old_id === new_id);
        same(ev["event"], "$create_alias");
    });

    test("$create_alias contains required properties", 1, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            new_id = this.id;

        var ev = alooma.integration_test.alias(new_id);

        same({ "distinct_id": old_id, "alias": new_id }, _.pick(ev.properties, "distinct_id", "alias"));
    });

    test("continues to use old ID after alias call", 3, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);

        alooma.integration_test.alias(new_id);
        same(alooma.integration_test.get_distinct_id(), old_id);
        same(alooma.integration_test.get_property(__alias), new_id);
    });

    test("aliasing same ID returns error code", 1, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            ev = alooma.integration_test.alias(old_id);

        same(ev, -1);
    });

    test("alias prevents identify from changing the ID", 3, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);
        alooma.integration_test.alias(new_id);
        alooma.integration_test.identify(new_id);
        same(alooma.integration_test.get_distinct_id(), old_id, "identify should not do anything");
        same(alooma.integration_test.get_property(__alias), new_id, "identify should not delete the __alias key");
    });

    test("identify with completely new ID blows away alias", 3, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            alias = this.id,
            new_id = rand_name();
        notOk((old_id === alias) || (alias === new_id) || (new_id === old_id));
        alooma.integration_test.alias(alias);
        alooma.integration_test.identify(new_id);
        same(alooma.integration_test.get_distinct_id(), new_id, "identify should replace the distinct id");
        same(alooma.integration_test.get_property(__alias), undefined, "__alias should get blown away");
    });

    test("alias not in props", 3, function() {
        var old_id = alooma.integration_test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);
        alooma.integration_test.alias(new_id);
        same(alooma.integration_test.get_property(__alias), new_id, "identify should not delete the __alias key");
        notOk(__alias in alooma.integration_test.persistence.properties())
    });

    test("alias not allowed when there is previous people distinct id", 2, function() {
        alooma.integration_test.register({"$people_distinct_id": this.id});
        same(alooma.integration_test.alias(this.id), -2);
        same(alooma.integration_test.get_property(__alias), undefined, "__alias should not be set");
    });

module("alooma._", {
    setup: function() {
        this.p = alooma._;
    }
});

    test("isObject", 5, function() {
        ok(this.p.isObject({}), "isObject identifies an object");
        ok(this.p.isObject({'hi': 'hi'}), "isObject identifies an object");
        notOk(this.p.isObject([]), "isObject fails array");
        notOk(this.p.isObject([1, 2, 3]), "isObject fails array");
        notOk(this.p.isObject("a string"), "isObject fails string");
    });

    test("toArray", 4, function() {
        function is_array(obj) {
            var obj_str = Object.prototype.toString.call(obj);
            return  (obj_str === '[object Array]');
        }

        var elements = document.getElementsByTagName("*");

        ok(is_array(this.p.toArray([])), "toArray handles arrays");
        ok(is_array(this.p.toArray(elements)), "toArray handles html lists");
        ok(is_array(this.p.toArray(null)), "toArray handles null");
        ok(is_array(this.p.toArray(undefined)), "toArray handles undefined");
    });

mpmodule("alooma.push");

    test("anon function called", 1, function() {
        var a = 1;
        alooma.push(function() {
            a = 2;
        });
        same(a, 2, 'Pushed function is executed immediately');
    });

    var value = Math.random();
    test("instance function called", 1, function() {
        alooma.push(['register', { value: value }]);
        same(alooma.persistence.props.value, value, "executed immediately");
    });

xhrmodule("alooma._check_and_handle_notifications");

    if (USE_XHR) {
        test("_check_and_handle_notifications makes a request to decide/ server", 2, function() {
            var initial_requests = this.requests.length;
            alooma.integration_test._check_and_handle_notifications(this.id);
            same(this.requests.length - initial_requests, 1, "_check_and_handle_notifications should have fired off a request");
            ok(this.requests[0].url.match(/decide\//));
        });

        test("notifications are never checked again after identify()", 2, function() {
            alooma.integration_test.identify(this.id);
            ok(this.requests.length >= 1, "identify should have fired off a request");

            var num_requests = this.requests.length;
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test._check_and_handle_notifications(this.id);
            same(this.requests.length, num_requests, "_check_and_handle_notifications after identify should not make requests");
        });

        test("_check_and_handle_notifications honors disable_notifications config", 1, function() {
            var initial_requests = this.requests.length;
            alooma.integration_test.set_config({disable_notifications: true});
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test.set_config({disable_notifications: false});
            same(this.requests.length - initial_requests, 0, "_check_and_handle_notifications should not have fired off a request");
        });
    } else {
        test("_check_and_handle_notifications makes a request", 1, function() {
            var num_scripts = $('script').length;
            alooma.integration_test._check_and_handle_notifications(this.id);
            stop();
            untilDone(function(done) {
                if ($('script').length === num_scripts + 1) {
                    ok("_check_and_handle_notifications fired off a request")
                    done();
                }
            });
        });

        asyncTest("notifications are never checked again after identify()", 2, function() {
            var num_scripts = $('script').length;
            alooma.integration_test.identify(this.id);
            untilDone(function(done) {
                if ($('script').length >= num_scripts + 1) {
                    ok("identify fired off a request");

                    num_scripts = $('script').length;
                    alooma.integration_test._check_and_handle_notifications(this.id);
                    alooma.integration_test._check_and_handle_notifications(this.id);
                    alooma.integration_test._check_and_handle_notifications(this.id);
                    alooma.integration_test._check_and_handle_notifications(this.id);
                    alooma.integration_test._check_and_handle_notifications(this.id);
                    setTimeout(function() {
                        same($('script').length, num_scripts, "_check_and_handle_notifications after identify should not make requests");
                        done();
                    }, 500); // TODO: remove the 500 ms wait
                }
            });
        });

        asyncTest("_check_and_handle_notifications honors disable_notifications config", 1, function() {
            var num_scripts = $('script').length;
            alooma.integration_test.set_config({disable_notifications: true});
            alooma.integration_test._check_and_handle_notifications(this.id);
            alooma.integration_test.set_config({disable_notifications: false});
            untilDone(function(done) {
                if ($('script').length === num_scripts) {
                    ok("_check_and_handle_notifications did not fire off a request");
                    done();
                }
            });
        });
    }

mpmodule("in-app notification display");

    asyncTest("notification with normal data adds itself to DOM", 1, function() {
        alooma._show_notification({
            body: "notification body test",
            title: "hallo"
        });
        untilDone(function(done) {
            if ($('#alooma-notification-takeover').length === 1) {
                $('#alooma-notification-wrapper').remove();
                ok('success');
                done();
            }
        });
    });

    asyncTest("mini notification with normal data adds itself to DOM", 1, function() {
        alooma._show_notification({
            body: "notification body test",
            type: "mini"
        });
        untilDone(function(done) {
            if ($('#alooma-notification-mini').length === 1) {
                $('#alooma-notification-wrapper').remove();
                ok('success');
                done();
            }
        });
    });

    test("notification does not show when images don't load", 1, function() {
        alooma._show_notification({
            body: "bad image body test",
            image_url: "http://notgonna.loadever.com/blablabla",
            title: "bad image title"
        });
        stop();
        setTimeout(function() {
            ok($('#alooma-notification-takeover').length === 0);
            start();
        }, 500);
    });

    test("calling _show_notification with bad data does not halt execution", 1, function() {
        alooma.integration_test._show_notification();
        alooma.integration_test._show_notification(15);
        alooma.integration_test._show_notification('hi');
        alooma.integration_test._show_notification({body: null});
        alooma.integration_test._show_notification({bla: 'bla'});
        ok(true);
    });

    asyncTest("notification prevents script injection", 1, function() {
        alooma._show_notification({
            body: 'injection test</div><img src="nope" onerror="window.injectedvar=42;"/>',
            title: "bad image title"
        });
        untilDone(function(done) {
            if ($('#alooma-notification-takeover').length === 1) {
                $('#alooma-notification-wrapper').remove();
                ok(_.isUndefined(window.injectedvar), 'window.injectedvar should not exist');
                done();
            }
        });
    });

mpmodule("verbose output");

    asyncTest("track endpoint returns json when verbose=1", 1, function() {
        alooma.integration_test.set_config({ verbose: true });

        alooma.integration_test.track('test', {}, function(response) {
            same(response, { status: 1, error: "" }, "server returned success1");
            start();
        });
    });

mpmodule("debug helpers");

    test("toString", 2, function() {
        same(alooma.integration_test.toString(), "alooma.integration_test");
        same(alooma.integration_test.people.toString(), "alooma.integration_test.people");
    });

mpmodule('user agent parser');

    test('device', 8, function() {
        // facebook browsing
        var a = "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A501 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPad2,7;FBMD/iPad;FBSN/iPhone OS;FBSV/7.0.2;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]";
        same(alooma._.info.device(a), 'iPad');

        var a = "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A465 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPhone5,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.0;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/fr_FR;FBOP/5]"
        same(alooma._.info.device(a), 'iPhone');

        var a = "Mozilla/5.0 (iPad; U; CPU iPhone OS 5_1_1 like Mac OS X; en_US) AppleWebKit (KHTML, like Gecko) Mobile [FBAN/FBForIPhone;FBAV/4.1.1;FBBV/4110.0;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/5.1.1;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBSF/1.0]";
        same(alooma._.info.device(a), 'iPad');

        // iPhone
        var a = "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53";
        same(alooma._.info.device(a), 'iPhone');

        // iPod Touch
        var a = "Mozila/5.0 (iPod; U; CPU like Mac OS X; en) AppleWebKit/420.1 (KHTML, like Geckto) Version/3.0 Mobile/3A101a Safari/419.3";
        same(alooma._.info.device(a), 'iPod Touch');

        // Android
        var a = "Mozilla/5.0 (Linux; U; Android 2.1; en-us; Nexus One Build/ERD62) AppleWebKit/530.17 (KHTML, like Gecko) Version/4.0 Mobile Safari/530.17";
        same(alooma._.info.device(a), 'Android');

        // Blackberry
        var a = "Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en-US) AppleWebKit/534.8+ (KHTML, like Gecko) Version/6.0.0.448 Mobile Safari/534.8+";
        same(alooma._.info.device(a), 'BlackBerry');

        // Windows Phone
        var a = "Mozilla/4.0 (compatible; MSIE 7.0; Windows Phone OS 7.0; Trident/3.1; IEMobile/7.0; Nokia;N70)"
        same(alooma._.info.device(a), 'Windows Phone');
    });

    test('browser', 32, function() {
        // facebook mobile
        var a = "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A501 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPad2,7;FBMD/iPad;FBSN/iPhone OS;FBSV/7.0.2;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]";
        same(alooma._.info.browser(a), 'Facebook Mobile');
        notOk(alooma._.isBlockedUA(a));

        // chrome
        var a = "Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1667.0 Safari/537.36";
        same(alooma._.info.browser(a), 'Chrome');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.2 Safari/537.36";
        same(alooma._.info.browser(a), 'Chrome');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.339";
        same(alooma._.info.browser(a), 'Chrome');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (iPhone; U; CPU iPhone OS 5_1_1 like Mac OS X; en-gb) AppleWebKit/534.46.0 (KHTML, like Gecko) CriOS/19.0.1084.60 Mobile/9B206 Safari/7534.48.3";
        same(alooma._.info.browser(a), 'Chrome iOS');
        notOk(alooma._.isBlockedUA(a));

        // ie
        var a = "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko";
        same(alooma._.info.browser(a), 'Internet Explorer');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)";
        same(alooma._.info.browser(a), 'Internet Explorer');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; MSIE 8.0; Windows NT 5.2; Trident/4.0; Media Center PC 4.0; SLCC1; .NET CLR 3.0.04320)";
        same(alooma._.info.browser(a), 'Internet Explorer');
        notOk(alooma._.isBlockedUA(a));

        // firefox
        var a = "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:25.0) Gecko/20100101 Firefox/25.0";
        same(alooma._.info.browser(a), 'Firefox');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; rv:22.0) Gecko/20130405 Firefox/23.0";
        same(alooma._.info.browser(a), 'Firefox');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; Win64; x64; rv:16.0.1) Gecko/20121011 Firefox/21.0.1";
        same(alooma._.info.browser(a), 'Firefox');
        notOk(alooma._.isBlockedUA(a));

        // Konqueror
        var a = "Mozilla/5.0 (X11; Linux) KHTML/4.9.1 (like Gecko) Konqueror/4.9";
        same(alooma._.info.browser(a), 'Konqueror');
        notOk(alooma._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; Konqueror/4.2; Linux; X11; x86_64) KHTML/4.2.4 (like Gecko) Fedora/4.2.4-2.fc11";
        same(alooma._.info.browser(a), 'Konqueror');
        notOk(alooma._.isBlockedUA(a));

        // opera
        same(alooma._.info.browser(a, null, true), 'Opera');

        var a = "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (J2ME/23.377; U; en) Presto/2.5.25 Version/10.54";
        same(alooma._.info.browser(a, null, true), 'Opera Mini');
        notOk(alooma._.isBlockedUA(a));

        // safari
        same(alooma._.info.browser(a, "Apple"), "Safari");

        var a = "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25";
        same(alooma._.info.browser(a, "Apple"), 'Mobile Safari');
        notOk(alooma._.isBlockedUA(a));
    });

    test('blocked user agents', 5, function() {
        var bot_user_agents = [
            "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
            "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
            "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"
        ];
        _.each(bot_user_agents, function(ua) {
            ok(alooma._.isBlockedUA(ua));
        });
    });

if( /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent) ) {
    mpmodule("mobile tests");
        test("device property included", 1, function() {
            stop();
            alooma.integration_test.track("test_device", {}, function(r, data) {
                ok('$device' in data.properties, "properties should include $device");
                start();
            });
        });
}

if (USE_XHR) {
    xhrmodule("xhr tests");

        asyncTest('xhr error handling code works', 2, function() {
            alooma.integration_test.track('test', {}, function(response) {
                same(response, 0, "xhr returned error");
                start();
            });

            same(this.requests.length, 1, "track should have fired off a request");

            var resp = 'HTTP/1.1 500 Internal Server Error';
            this.requests[0].respond(500, { 'Content-Length': resp.length, 'Content-Type': 'text' }, resp);
        });

        asyncTest('xhr error handling code supports verbose', 2, function() {
            alooma.integration_test.set_config({ verbose: true });

            alooma.integration_test.track('test', {}, function(response) {
                same(response, { status: 0, error: "Bad HTTP status: 500 Internal Server Error" }, "xhr returned verbose error");
                start();
            });

            same(this.requests.length, 1, "track should have fired off a request");

            var resp = 'HTTP/1.1 500 Internal Server Error';
            this.requests[0].respond(500, { 'Content-Length': resp.length }, resp);
        });
}

}, 10);
};

})();
