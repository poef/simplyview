this.simply = (function(simply, global) {

    var routeInfo = [];

    function parseRoutes(routes) {
        var paths = Object.keys(routes);
        var matchParams = /:(\w+|\*)/g;
        var matches, params, path;
        for (var i=0; i<paths.length; i++) {
            path    = paths[i];
            matches = [];
            params  = [];
            do {
                matches = matchParams.exec(path);
                if (matches) {
                    params.push(matches[1]);
                }
            } while(matches);
            routeInfo.push({
                match:  new RegExp('^'+path.replace(/:\w+/g, '([^/]+)').replace(/:\*/, '(.*)')),
                params: params,
                action: routes[path]
            });
        }
    }

    var linkHandler = function(evt) {
        if (evt.ctrlKey) {
            return;
        }
        if (evt.which != 1) {
            return; // not a 'left' mouse click
        }
        var link = evt.target;
        while (link && link.tagName!='A') {
            link = link.parentElement;
        }
        if (link 
            && link.pathname 
            && link.hostname==document.location.hostname 
            && !link.link
            && !link.dataset.simplyCommand
            && simply.route.has(link.pathname)
        ) {
            simply.route.goto(link.pathname);
            evt.preventDefault();
            return false;
        }
    };

    simply.route = {
        handleEvents: function() {
            global.addEventListener('popstate', function() {
                simply.route.match(document.location.pathname);
            });
            document.addEventListener('click', linkHandler);
        },
        load: function(routes) {
            parseRoutes(routes);
        },
        match: function(path, options) {
            var matches;
            for ( var i=0; i<routeInfo.length; i++) {
                if (path[path.length-1]!='/') {
                    matches = routeInfo[i].match.exec(path+'/');
                    if (matches) {
                        path+='/';
                        history.replaceState({}, '', path);
                    }
                }
                matches = routeInfo[i].match.exec(path);
                if (matches && matches.length) {
                    var params = {};
                    routeInfo[i].params.forEach(function(key, i) {
                        if (key=='*') {
                            key = 'remainder';
                        }
                        params[key] = matches[i+1];
                    });
                    Object.assign(params, options);
                    return routeInfo[i].action.call(simply.route, params);
                }
            }
        },
        goto: function(path) {
            history.pushState({},'',path);
            return simply.route.match(path);
        },
        has: function(path) {
            for ( var i=0; i<routeInfo.length; i++) {
                var matches = routeInfo[i].match.exec(path);
                if (matches && matches.length) {
                    return true;
                }
            }
            return false;
        }
    };

    return simply;

})(this.simply || {}, this);
