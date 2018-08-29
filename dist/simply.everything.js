window.simply = (function(simply) {
    var defaultActions = {
        'simply-hide': function(el) {
            el.classList.remove('simply-visible');
            return Promise.resolve();
        },
        'simply-show': function(el) {
            el.classList.add('simply-visible');
            return Promise.resolve();
        },
        'simply-select': function(el,group,target,targetGroup) {
            if (group) {
                this.call('simply-deselect', this.app.container.querySelectorAll('[data-simply-group='+group+']'));
            }
            el.classList.add('simply-selected');
            if (target) {
                this.call('simply-select',target,targetGroup)
            }
            return Promise.resolve();
        },
        'simply-toggle-select': function(el,group,target,targetGroup) {
            if (!el.classList.contains('simply-selected')) {
                this.call('simply-select',el,group,target,targetGroup);
            } else {
                this.call('simply-deselect',el,target);
            }
            return Promise.resolve();
        },
        'simply-toggle-class': function(el,className,target) {
            if (!target) {
                target = el;
            }
            return Promise.resolve(target.classList.toggle(className));
        },
        'simply-deselect': function(el,target) {
            if ( typeof el.length=='number' && typeof el.item=='function') {
                el = Array.prototype.slice.call(el);
            }
            if ( Array.isArray(el) ) {
                for (var i=0,l=el.length; i<l; i++) {
                    this.call('simply-deselect',el[i],target);
                    target = null;
                }
            } else {
                el.classList.remove('simply-selected');
                if (target) {
                    this.call('simply-deselect',target);
                }
            }
            return Promise.resolve();
        },
        'simply-fullscreen': function(target) {
            var methods = {
                'requestFullscreen':{exit:'exitFullscreen',event:'fullscreenchange',el:'fullscreenElement'},
                'webkitRequestFullScreen':{exit:'webkitCancelFullScreen',event:'webkitfullscreenchange',el:'webkitFullscreenElement'},
                'msRequestFullscreen':{exit:'msExitFullscreen',event:'MSFullscreenChange',el:'msFullscreenElement'},
                'mozRequestFullScreen':{exit:'mozCancelFullScreen',event:'mozfullscreenchange',el:'mozFullScreenElement'}
            };
            for ( var i in methods ) {
                if ( typeof document.documentElement[i] != 'undefined' ) {
                    var requestMethod = i;
                    var cancelMethod = methods[i].exit;
                    var event = methods[i].event;
                    var element = methods[i].el;
                    break;
                }
            }
            if ( !requestMethod ) {
                return;
            }
            if (!target.classList.contains('simply-fullscreen')) {
                target.classList.add('simply-fullscreen');
                target[requestMethod]();
                var self = this;
                var exit = function() {
                    if ( !document[element] ) {
                        target.classList.remove('simply-fullscreen');
                        document.removeEventListener(event,exit);
                    }
                }
                document.addEventListener(event,exit);
            } else {
                target.classList.remove('simply-fullscreen');
                document[cancelMethod]();
            }
            return Promise.resolve();
        }
    };

    simply.actions = function(app, inActions) {
        actions = Object.create(defaultActions);
		for ( var i in inActions ) {
			actions[i] = inActions[i];
		}

        actions.app = app;
        actions.call = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return this[name].apply(this, params);
        }
        return actions;
    }

    return simply;
    
})(window.simply || {});
window.simply = (function(simply) {

	/*** utility functions ****/	
	function throttle( callbackFunction, intervalTime ) {
		var eventId = 0;
		return function() {
			var myArguments = arguments;
			var me = this;
			if ( eventId ) {
				return;
			} else {
				eventId = window.setTimeout( function() {
					callbackFunction.apply(me, myArguments);
					eventId = 0;
				}, intervalTime );
			}
		}
	}

	function getElement(node) {
		if (node.nodeType != Node.ELEMENT_NODE) {
			return node.parentElement;
		}
		return node;
	}


	function getFieldType(fieldTypes, el) {
		var setters = Object.keys(fieldTypes);
		for(var i=setters.length-1;i>=0;i--) {
			if (el.matches(setters[i])) {
				return fieldTypes[setters[i]];
			}
		}
		return null;
	}

	function setValue(el, value, binding) {
		if (el!=focusedElement) {
			var fieldType = getFieldType(binding.fieldTypes, el);
			if (fieldType) {
				fieldType.set.call(el, (typeof value != 'undefined' ? value : ''));
				el.dispatchEvent(new Event('simply.bind.resolved', {
					bubbles: true,
					cancelable: false
				}));
			}
		}
	}

	function getValue(el, binding) {
		var setters = Object.keys(binding.fieldTypes);
		for(var i=setters.length-1;i>=0;i--) {
			if (el.matches(setters[i])) {
				return binding.fieldTypes[setters[i]].get.call(el);
			}
		}
	}

	/** FIXME: getPath should be configurable **/
	function getPath(el, attribute) {
		var attributes = attribute.split(',');
		for (var attr of attributes) {
			if (el.hasAttribute(attr)) {
				return el.getAttribute(attr);
			}
		}
		return null;
	}

	/*** shadow values ***/
	var shadows = new WeakMap();
	var focusedElement = null;
	/**
	 * Returns an object ment to keep the original value of model[jsonPath]
	 */
	function getShadow(model, jsonPath) {
		if (!shadows.has(model)) {
			shadows.set(model, {});
		}
		var root = shadows.get(model);
		if (typeof root[jsonPath] == 'undefined') {
			root[jsonPath] = {
				value: null,
				elements: [],
				children: {},
				listeners: []
			};
		}
		return root[jsonPath];
	}

	function triggerListeners(listeners, value) {
		listeners.forEach(function(callback) {
			callback.call(null, value);
		});
	}

	/**
	 * Returns true if a shadow for this path and rootModel exist
	 * This means that there is already a setter/getter pair for it.
	 **/
	function hasShadow(model, jsonPath) {
		if (!shadows.has(model)) {
			shadows.set(model, {});
		}
		var root = shadows.get(model);
		return typeof root[jsonPath] != 'undefined';
	}

	function Binding(config) {
		this.config = config;
		if (!this.config) {
			this.config = {};
		}
		if (!this.config.model) {
			this.config.model = {};
		}
		if (!this.config.attr) {
			this.config.attr = 'data-bind';
		}
		if (!this.config.selector) {
			this.config.selector = '[data-bind]';
		}
		this.fieldTypes = {
			'*': {
				set: function(value) {
					this.innerHTML = value;
				},
				get: function() {
					return this.innerHTML;
				}
			}
		};
		if (this.config.fieldTypes) {
			Object.assign(this.fieldTypes, this.config.fieldTypes);
		}
		this.attach(document.querySelectorAll(this.config.selector));
	};

	Binding.prototype.attach = function(elements) {
		var self = this;



		/**
		 * Attaches a binding to a specific html element.
		 **/
		var attachElement = function(jsonPath, el) {
			if (!document.body.contains(el)) {
				// element is no longer part of the document
				// so don't bother changing the model or updating the element for it
				return;
			}
			//FIXME: allow different property instead of 'data-bind'
			var nested = el.parentElement.closest('[data-bind="'+el.dataset.bind+'"]');
			if (nested && !fieldAllowsNesting(nested)) {
				console.log('Error: illegal nested data-binding found for '+el.dataset.bind);
				console.log(el);
				return;
			}
			var keys       = jsonPath.split('.'),
			    parentPath = '',
			    path       = '',
			    shadow,
			    model      = self.config.model;

			do {
				key    = keys.shift();
				path   = simply.path.push(path, key);
				shadow = getShadow(self.config.model, path);
				if (keys.length) {
					shadow.children[ simply.path.push(path,keys[0]) ] = true;
				}
				if (model && typeof model == 'object') {
					shadow.value = model[key];
					Object.defineProperty(model, key, {
						set: (function(shadow, path) {
							return function(value) {
								shadow.value = value;
								updateElements(shadow.elements, value);
								attachChildren(shadow);
								addSetTriggers(shadow);
								updateParents(path);
								monitorProperties(value, path);
								triggerListeners(shadow.listeners, value);
							};
						})(shadow, path),
						get: (function(shadow) {
							return function() {
								return shadow.value;
							}
						})(shadow),
						configurable: true,
						enumerable: true
					});
					model = model[key];
				}
				parentPath = path;
			} while(keys.length);
			if (shadow.elements.indexOf(el)==-1) {
				shadow.elements.push(el);
			}
			initElement(el);
			updateElements([el], model);
			monitorProperties(model, path);
		};

		var fieldAllowsNesting = function(el) {
			var fieldType = getFieldType(self.fieldTypes, el);
			return fieldType && fieldType.allowNesting;
		};

		/**
		 * This will call updateElements on all parents of jsonPath that are
		 * bound to some elements.
		 **/
		var updateParents = function(jsonPath) {
			var parents = simply.path.parents(jsonPath);
			parents.pop();
			parents.reverse().forEach(function(parent) {
				shadow = getShadow(self.config.model, parent);
				if (shadow && shadow.elements.length) {
					updateElements(shadow.elements, shadow.value);
				}
			});
		};

		/**
		 * This defines setters/getters for properties that aren't bound
		 * to elements directly, but who have a parent object that is.
		 **/
		var monitorProperties = function(model, path) {
			if (!model || typeof model != 'object') {
				return;
			}

			var _shadow = {};
			Object.keys(model).forEach(function(property) {
				if (!hasShadow(self.config.model, simply.path.push(path,property))) {
					// If the property has a shadow, then it is already bound
					// and has a setter that will call updateParents
					_shadow[property] = model[property];
					Object.defineProperty(model, property, {
						set: function(value) {
							_shadow[property] = value;
							updateParents(path);
						},
						get: function() {
							return _shadow[property];
						},
						configurable: true,
						enumerable: true
					});
				}
				if (model[property] && typeof model[property] == 'object') {
					monitorProperties(model[property], simply.path.push(path,property));
				}
			});
		}
		
		/**
		 * Runs the init() method of the fieldType, if it is defined.
		 **/
		var initElement = function(el) {
			var selectors = Object.keys(self.fieldTypes);
			for (var i=selectors.length-1; i>=0; i--) {
				if (self.fieldTypes[selectors[i]].init && el.matches(selectors[i])) {
					self.fieldTypes[selectors[i]].init.call(el, self);
					return;
				}
			}
		};

		/**
		 * Updates the given elements with the new value, if the element is still
		 * in the document.body. Otherwiste it will remove the element from the
		 * elements list. During the update the observer is paused.
		 **/
		var updateElements = function(elements, value) {
			var reconnectObserver;
			if (self.observing) {
				self.observer.disconnect();
				self.observing = false;
				reconnectObserver = true;
			}
			elements.forEach(function(el, index) {
				if (document.body.contains(el)) {
					setValue(el, value, self);
					var children = el.querySelectorAll(self.config.selector);
					if (children.length) {
						self.attach(children);
					}
				} else {
					elements.splice(index,1);
				}
			});
			if (reconnectObserver) {
		        self.observing = true;
				self.observer.observe(document.body, {
		        	subtree: true,
		        	childList: true,
		        	characterData: true,
		        	attributes: true	
		        });
		    }
		};

		/**
		 * Loops over registered children of the shadow, that means a sub property
		 * is bound to an element, and reattaches those to their elements with the
		 * new values.
		 **/
		var attachChildren = function( shadow) {
			Object.keys(shadow.children).forEach(function(child) {
				var value = simply.path.get(self.config.model, child);
				var childShadow = getShadow(self.config.model, child);
				childShadow.value = value;
				childShadow.elements.forEach(function(el) {
					attachElement(child, el);
				});
			});
		};

		/**
		 * Adds a setter for all bound child properties that restores the bindings
		 * when a new value is set for them. This is to restore bindings after a
		 * parent value is changed so the original property is no longer set.
		 * It is not enumerable, so it won't show up in Object.keys or JSON.stringify
		 **/
		var addSetTriggers = function(shadow){
			Object.keys(shadow.children).forEach(function(childPath) {
				var name = simply.path.pop(childPath);
				if (shadow.value && typeof shadow.value[name] == 'undefined') {
					Object.defineProperty(shadow.value, name, {
						set: function(value) {
							restoreBinding(childPath);
							shadow.value[name] = value;
						},
						configurable: true,
						enumerable: false
					});
				}
			});
		}

		/**
		 * Restores the binding for all registered bound elements.
		 * Run when the set trigger is called.
		 **/
		var restoreBinding = function(path) {
			var shadow = getShadow(self.config.model, path);
			[].forEach.call(shadow.elements, function(element) {
            	attachElement(path, element);
        	});
		}

		if ( elements instanceof HTMLElement ) {
			elements = [ elements ];
		}
		[].forEach.call(elements, function(element) {
            var key = getPath(element, self.config.attribute);
            attachElement(key, element);
        });
        document.body.addEventListener('simply.bind.update', function(evt) {
			focusedElement = evt.target;
			simply.path.set(self.config.model, getPath(evt.target, self.config.attribute), getValue(evt.target, self));
			focusedElement = null;
        }, true);
	};

	var runWhenIdle = (function() {
		if (window.requestIdleCallback) {
			return function(callback) {
				window.requestIdleCallback(callback, {timeout: 500});
			};
		}
		return window.requestAnimationFrame;
	})();

	Binding.prototype.observe = function(root) {
		var changes = [];
		var self    = this;

		var handleChanges = throttle(function() {
			runWhenIdle(function() {
				changes = changes.concat(self.observer.takeRecords());
				self.observer.disconnect();
				self.observing = false;
				var change,el,children;
				var handledKeys = {}; // list of keys already handled
				var handledElements = new WeakMap();
				for (var i=changes.length-1; i>=0; i--) {
					// handle last change first, so programmatic changes are predictable
					// last change overrides earlier changes
					change = changes[i];
					el = getElement(change.target);
					if (!el) {
						continue;
					}
					if (handledElements.has(el)) {
						continue;
					}
					handledElements.set(el, true);
					children = el.querySelectorAll(self.config.selector);
					if (children.length) {
						self.attach(children);
					}
					if (!el.matches(self.config.selector)) {
						el = el.closest(self.config.selector);
					}
					if (el) {
						var key = getPath(el, self.config.attribute);
						if (handledKeys[key]) {
							// we already handled this key, the model is uptodate
							continue;
						}
						handledKeys[key] = true;
						focusedElement = el;
						simply.path.set(self.config.model, key, getValue(el, self));
						focusedElement = null;
					}
				}
				changes = [];
				self.observing = true;
				self.observer.observe(root, {
		        	subtree: true,
		        	childList: true,
		        	characterData: true,
		        	attributes: true				
				});
			});
		},100);
        this.observer = new MutationObserver(function(changeList) {
        	changes = changes.concat(changeList);
        	handleChanges();
        });
        this.observing = true;
        this.observer.observe(root, {
        	subtree: true,
        	childList: true,
        	characterData: true,
        	attributes: true	
        });
        return this;
	};

	Binding.prototype.stopObserver = function() {
		this.observer.disconnect();
		this.observing = false;
	};

	Binding.prototype.addListener = function(jsonPath, callback) {
		var shadow = getShadow(this.config.model, jsonPath);
		shadow.listeners.push(callback);
	};

	Binding.prototype.removeListener = function(jsonPath, callback) {
		var shadow = getShadow(this.config.model, jsonPath);
		shadow.listeners = shadow.listeners.filter(function(listener) {
			if (listener==callback) {
				return false;
			}
			return true;
		});
	};

	simply.bind = function(config) {
		return new Binding(config);
	};

    return simply;
})(window.simply || {});
window.simply = (function(simply) {

    var knownCollections = {};
    
    simply.collections = {
        addListener: function(name, callback) {
            if (!knownCollections[name]) {
                knownCollections[name] = [];
            }
            if (knownCollections[name].indexOf(callback) == -1) {
                knownCollections[name].push(callback);
            }
        },
        removeListener: function(name, callback) {
            if (knowCollections[name]) {
                var index = knownCollections[name].indexOf(callback);
                if (index>=0) {
                    knownCollections[name].splice(index, 1);
                }
            }
        },
        update: function(element, value) {
            element.value = value;
            editor.fireEvent('change', element);
        }
    };

    function findCollection(el) {
        while (el && !el.dataset.simplyCollection) {
            el = el.parentElement;
        }
        return el;
    }
    
    document.addEventListener('change', function(evt) {
        var root = null;
        var name = '';
        if (evt.target.dataset.simplyElement) {
            root = findCollection(evt.target);
            if (root && root.dataset) {
                name = root.dataset.simplyCollection;
            }
        }
        if (name && knownCollections[name]) {
            var inputs = root.querySelectorAll('[data-simply-element]');
            var elements = [].reduce.call(inputs, function(elements, input) {
                elements[input.dataset.simplyElement] = input;
                return elements;
            }, {});
            for (var i=knownCollections[name].length-1; i>=0; i--) {
                var result = knownCollections[name][i].call(evt.target.form, elements);
                if (result === false) {
                    break;
                }
            }
        }
    }, true);

    return simply;

})(window.simply || {});
window.simply = (function(simply) {

    var defaultCommands = {
        'simply-hide': function(el, value) {
            var target = this.app.get(value);
            if (target) {
                this.action('simply-hide',target);
            }
        },
        'simply-show': function(el, value) {
            var target = this.app.get(value);
            if (target) {
                this.action('simply-show',target);
            }
        },
        'simply-select': function(value,el) {
            var group = el.dataset.simplyGroup;
            var target = this.app.get(value);
            var targetGroup = (target ? target.dataset.simplyGroup : null);
            this.action('simply-select', el, group, target, targetGroup);
        },
        'simply-toggle-select': function(el, value) {
            var group = el.dataset.simplyGroup;
            var target = this.app.get(value);
            var targetGroup = (target ? target.dataset.simplyTarget : null);
            this.action('simply-toggle-select',el,group,target,targetGroup);
        },
        'simply-toggle-class': function(el, value) {
            var target = this.app.get(el.dataset.simplyTarget);
            this.action('simply-toggle-class',el,value,target);
        },
        'simply-deselect': function(el, value) {
            var target = this.app.get(value);
            this.action('simply-deselect',el,target);
        },
        'simply-fullscreen': function(el, value) {
            var target = this.app.get(value);
            this.action('simply-fullscreen',target);
        }
    };


    var handlers = [
        {
            match: 'input,select,textarea',
            get: function(el) {
                return el.dataset.simplyValue || el.value;
            },
            check: function(el, evt) {
                return evt.type=='change' || (el.dataset.simplyImmediate && evt.type=='input');
            }
        },
        {
            match: 'a,button',
            get: function(el) {
                return el.dataset.simplyValue || el.href || el.value;
            },
            check: function(el,evt) {
                return evt.type=='click' && evt.ctrlKey==false && evt.button==0;
            }
        },
        {
            match: 'form',
            get: function(el) {
                return new FormData(el);
            },
            check: function(el,evt) {
                return evt.type=='submit';
            }
        }
    ];

    function getCommand(evt) {
        var el = evt.target;
        while ( el && !el.dataset.simplyCommand ) {
            el = el.parentElement;
        }
        if (el) {
            for (var i=handlers.length-1; i>=0; i--) {
                if (el.matches(handlers[i].match) && handlers[i].check(el, evt)) {
                    return {
                        name:   el.dataset.simplyCommand,
                        source: el,
                        value:  handlers[i].get(el)
                    };
                }
            }
        }
        return null;
    }

    simply.commands = function(app, inCommands) {

        var commands = Object.create(defaultCommands);
        for (var i in inCommands) {
            commands[i] = inCommands[i];
        }

        commands.app = app;

        commands.action = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return app.actions[name].apply(app.actions,params);
        }

        commands.call = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return this[name].apply(this,params);            
        }

        commands.addHandler = function(handler) {
            handlers.push(handler);
        }

        var commandHandler = function(evt) {
            var command = getCommand(evt);
            if ( command ) {
                commands.call(command.name, command.source, command.value);
                evt.preventDefault();
                evt.stopPropagation();
                return false;
            }
        };

        app.container.addEventListener('click', commandHandler);
        app.container.addEventListener('submit', commandHandler);
        app.container.addEventListener('change', commandHandler);
        app.container.addEventListener('input', commandHandler);

        return commands;
    };

    return simply;
    
})(window.simply || {});
window.simply = (function(simply) {
    simply.app = function(options) {
        if (!options) {
            options = {};
        }
        if (!options.container) {
            console.log('No simply.app application container element specified, using document.body.');
        }
        
        function simplyApp(options) {
            if (!options) {
                options = {};
            }
            this.container = options.container  || document.body;
            this.actions   = simply.actions ? simply.actions(this, options.actions) : false;
            this.commands  = simply.commands ? simply.commands(this, options.commands) : false;
            this.sizes     = {
                'simply-tiny'   : 0,
                'simply-xsmall' : 480,
                'simply-small'  : 768,
                'simply-medium' : 992,
                'simply-large'  : 1200
            }
            this.view      = simply.view ? simply.view(this, options.view) : false;
            if (simply.bind) {
                options.bind = simply.render(options.bind || {});
                options.bind.model = this.view;
                this.bind = simply.bind(options.bind);
                if (options.bind.observe) {
                    this.bind.observe(this.container);
                }
            }
        }

        simplyApp.prototype.get = function(id) {
            return this.container.querySelector('[data-simply-id='+id+']') || document.getElementById(id);
        }

        var app = new simplyApp(options);

        if ( simply.toolbar ) {
            var toolbars = app.container.querySelectorAll('.simply-toolbar');
            for ( var i=0,l=toolbars.length; i<l; i++) {
                simply.toolbar.init(toolbars[i]);
            }
            if (simply.toolbar.scroll) {
                for ( var i=0,l=toolbars.length; i<l; i++) {
                    simply.toolbar.scroll(toolbars[i]);
                }
            }
        }

        var lastSize = 0;
        function resizeSniffer() {
            var size = app.container.getBoundingClientRect().width;
            if ( lastSize==size ) {
                return;
            }
            lastSize  = size;
            var sizes = Object.keys(app.sizes);
            var match = null;
            while (match=sizes.pop()) {
                if ( size<app.sizes[match] ) {
                    if ( app.container.classList.contains(match)) {
                        app.container.classList.remove(match);
                    }
                } else {
                    if ( !app.container.classList.contains(match) ) {
                        app.container.classList.add(match);
                    }
                    break;
                }
            }
            while (match=sizes.pop()) {
                if ( app.container.classList.contains(match)) {
                    app.container.classList.remove(match);
                }
            }
            var toolbars = app.container.querySelectorAll('.simply-toolbar');
            for (var i=toolbars.length-1; i>=0; i--) {
                toolbars[i].style.transform = '';
            }
        }

        if ( window.attachEvent ) {
            app.container.attachEvent('onresize', resizeSniffer);
        } else {
            window.setInterval(resizeSniffer, 200);
        }
        
        return app;
    };


    return simply;
})(window.simply || {});
var simply = (function(simply) {

	simply.path = {
		get: function(model, path) {
			if (!path) {
				return model;
			}
			return path.split('.').reduce(function(acc, name) {
				return (acc && acc[name] ? acc[name] : null);
			}, model);
		},
		set: function(model, path, value) {
			var lastName   = simply.path.pop(path);
			var parentPath = simply.path.parent(path);
			var parentOb   = simply.path.get(model, parentPath);
			parentOb[lastName] = value;
		},
		pop: function(path) {
			return path.split('.').pop();
		},
		push: function(path, name) {
			return (path ? path + '.' : '') + name;
		},
		parent: function(path) {
			var p = path.split('.');
			p.pop();
			return p.join('.');
		},
		parents: function(path) {
			var result = [];
			path.split('.').reduce(function(acc, name) {
				acc.push( (acc.length ? acc[acc.length-1] + '.' : '') + name );
				return acc;
			},result);
			return result;
		}
	};

	return simply;
})(window.simply || {});
window.simply = (function(simply) {

    simply.render = function(options) {
        if (!options) {
            options = {};
        }
        options = Object.assign({
            attribute: 'data-simply-bind,data-simply-list',
            selector: '[data-simply-bind],[data-simply-list]',
            observe: true
        }, options);

        options.fieldTypes = Object.assign({
            '*': {
                set: function(value) {
                    this.innerHTML = value;
                },
                get: function() {
                    return this.innerHTML;
                }
            },
            'input,textarea,select': {
                init: function(binding) {
                    this.addEventListener('input', function(evt) {
                        if (binding.observing) {
                            this.dispatchEvent(new Event('simply.bind.update', {
                                bubbles: true,
                                cancelable: true
                            }));
                        }
                    });
                },
                set: function(value) {
                    this.value = value;
                },
                get: function() {
                    return this.value;
                }
            },
            'input[type=radio]': {
                init: function(binding) {
                    this.addEventListener('change', function(evt) {
                        if (binding.observing) {
                            this.dispatchEvent(new Event('simply.bind.update', {
                                bubbles: true,
                                cancelable: true
                            }));
                        }
                    });
                },
                set: function(value) {
                    this.checked = (value==this.value);
                },
                get: function() {
                    var checked;
                    if (this.form) {
                        return this.form[this.name].value;
                    } else if (checked=document.body.querySelector('input[name="'+this.name+'"][checked]')) { 
                        return checked.value;
                    } else {
                        return null;
                    }
                }
            },
            'input[type=checkbox]': {
                init: function(binding) {
                    this.addEventListener('change', function(evt) {
                        if (binding.observing) {
                            this.dispatchEvent(new Event('simply.bind.update', {
                                bubbles: true,
                                cancelable: true
                            }));
                        }
                    });
                },
                set: function(value) {
                    this.checked = (value.checked);
                    this.value = value.value;
                },
                get: function() {
                    return {
                        checked: this.checked,
                        value: this.value
                    };
                }
            },
            'select[multiple]': {
                init: function(binding) {
                    this.addEventListener('change', function(evt) {
                        if (binding.observing) {
                            this.dispatchEvent(new Event('simply.bind.update', {
                                bubbles: true,
                                cancelable: true
                            }));
                        }
                    });
                },
                set: function(value) {
                    for (i=0,l=this.options.length;i<l;i++) {
                        this.options[i].selected = (value.indexOf(this.options[i].value)>=0);
                    }
                },
                get: function() {
                    return this.value;
                }
            }
        }, options.fieldTypes);

        return options;
    }

    return simply;
})(window.simply || {});
window.simply = (function(simply) {

	var routeInfo = [];

	function parseRoutes(routes) {
		var paths = Object.keys(routes);
		var matchParams = /\:(\w+)/;
		for (var i=0; i<paths.length; i++) {
			var path        = paths[i];
			var matches     = matchParams.exec(path);
			var params      = matches ? matches.slice(1) : [];
			routeInfo.push({
				match:  new RegExp(path.replace(/\:\w+/, '([^/]+)').replace(/\:\*/, '(.*)')),
				params: params,
				action: routes[path]
			});
		}
	}

	simply.route = {
		load: function(routes) {
			parseRoutes(routes);
		},
		match: function(path) {
			for ( var i=0; i<routeInfo.length; i++) {
				var matches = routeInfo[i].match.exec(path);
				if (matches && matches.length) {
					var params = {};
					routeInfo[i].params.forEach(function(key, i) {
						if (key=='*') {
							key = 'remainder';
						}
						params[key] = matches[i+1];
					});
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

	window.addEventListener('popstate', function() {
		simply.route.match(document.location.pathname);
	});

	var linkHandler = function(evt) {
		if (evt.ctrlKey) {
			return;
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

	document.addEventListener('click', linkHandler);

	return simply;

})(window.simply || {});
window.simply = (function(simply) {

	simply.view = function(app, view) {

		app.view = view || {}

		var load = function() {
			var data = app.view;
			var path = editor.data.getDataPath(app.container);
			app.view = editor.currentData[path];
			Object.keys(data).forEach(function(key) {
				app.view[key] = data[key];
			});
		}

		if (window.editor && editor.currentData) {
			load();
		} else {
			document.addEventListener('simply-content-loaded', function() {
				load();
			});
		}
		
		return app.view;
	};

	return simply;
})(window.simply || {});