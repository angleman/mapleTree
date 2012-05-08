
var util = require('util')
   , events = require('events')
   , match = require('./match.js')


/*
 * @param {RegExp} reg_exp
 * @param {Array} params_a    =>  represents 'colon' in '/hello/:colon'
 * @param {Function} cb  => callback
 */
var RouteNode = function (reg_exp, params_a, cb) {
  if (!(this instanceof RouteNode)) { return new RouteNode(reg_exp) }
  if (!reg_exp) { throw new Error('route needs a regexp to be defined') }
  if (typeof params_a === 'function' && !cb) {
    cb = params_a
    params_a = null
  }

  var self = this

  self.children = []
  self.regexp = reg_exp
  self.key = self.regexp.toString()
  self.callback = cb  //callback is optional, if we don't have a callback, it means that we aren't an executable route,
  if (params_a) { self.params = params_a } 
}
//util.inherits(RouteNode, events.EventEmitter)
//should RouteTree or RouteNode be the event emitter? question to answer later

/*
 *
 * @param {object} options
 * flags => 'fifo' : true or false (false default)  //represents how we match partially
 */
var RouteTree = function (options) {
   this.root = new RouteNode(/^$/)
   if (!options) {
     options = {}
     options.fifo = false
   }
   this.fifo = options.fifo
}
util.inherits(RouteTree, events.EventEmitter)

RouteTree.prototype._defineRecursiveHelper = function (curNode, splats, cb) {
  //debugger
  var currentRoute = splats.shift() 
     , newNode 
     , i
     , curKey = currentRoute.regexp.toString()

  for (i = 0; i < curNode.children.length; i++) {    //does a child node with same key already exist?
    if (curNode.children[i].key === curKey) {  
      if (splats.length) { this._defineRecursiveHelper(curNode.children[i], splats, cb) }
      else { 
        //redefine callback, maybew throw error in future, or warn the user
        if (curNode.children[i].callback) { console.warn('WARNING: redefining route, this will create routing conflicts') }
        curNode.children[i].callback = cb
      }
      return //don't allow anything else to happen on current call frame
    }
  }

  //debugger
  newNode = new RouteNode(currentRoute.regexp, currentRoute.params) 
  curNode.children.push(newNode)
  if (splats.length) {
    this._defineRecursiveHelper(newNode, splats, cb)
  } else {
    //end of recursion, we have a matching function
    newNode.callback = cb
  }
}

RouteTree.prototype.define = function (path, callback) {
   if (!path || !callback) { throw new Error('tree needs a path and a callback to be defined') }
   var prereq = / |\?/g
      , portions
      , matches = []
      , i

   if (typeof path === 'string') {
      if (prereq.test(path)) {
         throw new Error('path cannot contain spaces or a question mark')
      }
      //debugger
      if (path === '/') {
         var rootNode = new RouteNode(/^\/$/, callback)
         this.root.children.unshift(rootNode) //keep root at front of array to optimize the match against root, will stay O(1)
      } else {
         path = _removeBeginEndSlash(path)
         portions = path.split('/') 
         for (i = 0; i < portions.length; i+=1) {
            matches[i] = match(portions[i])  //returns {regexp:reg , params:[id1,id2,...]}
         }
         this._defineRecursiveHelper(this.root, matches, callback)
      }
   } else if (path instanceof RegExp) {
      //TODO
      //figure out an elegant way to handle this that doesn't involve only definining it as root's child
      var newNode = new RouteNode(path, callback) 
      this.root.children.push(newNode)
   }

}

RouteTree.prototype._matchRecursiveHelper = function (curNode, curPath, matcher) {
   //debugger
   var i
      , j
      , exe
      , mNode
      , mPath

   for (i = 0; i < curNode.children.length; i+=1) {
      exe = curNode.children[i].regexp.exec(curPath)
      if (exe) {
         mNode = curNode.children[i]
         mNode.regexp.lastIndex = 0 //keep matching from start of str
         mPath = exe[0]
         mPath = _removeBeginEndSlash(mPath)
         if (exe.length > 1) { 
           if (mNode.params) {
             for (j = 0; j < mNode.params.length && (j+1) < exe.length; j++) {
               matcher.params[mNode.params[j]] = exe[j+1]
             }
           } else {
             for (j = 1; j < exe.length; j++) {
               matcher.extras.push(exe[j]) 
             }
           }
         }
         curPath = curPath.slice(mPath.length + 1)
         if (curPath.length && curPath !== '/') {    //continute recursive search
           if (mNode.callback) { matcher.cbs.push(mNode.callback) }
           return this._matchRecursiveHelper(mNode , curPath, matcher) 
         } else {
           if (mNode.callback) { //callback indicates this route was explicitly declared, not just a branch of another route
             matcher.perfect = true 
             matcher.cbs.push(mNode.callback)
           }
           return matcher 
         }
      }
   }

   return matcher
}

RouteTree.prototype.match = function (path) {
  var matcher = new Matcher()
    , decodedPath
  //normalize data, this is necessary
  if (path.charAt(0) !== '/') { path = '/' + path }
  if (path.charAt(path.length-1) !== '/') { path += '/' } //normalize routes coming in
  
  try {
    decodedPath = decodeURIComponent(path)
  } catch (err) {
    decodedPath = path   //oh well
  }


  this._matchRecursiveHelper(this.root, decodedPath, matcher)
 
  //callbacks are added in least preferential order through push(), so reverse order so we get the best match be first
  // TODO, what's more effieicent, adding callbacks using unshift() instead of push, or just reversing the order after the fact
  // gut says push(), then rever() is more efficient
  if (!this.fifo) { matcher.cbs.reverse() }
  matcher.fn = matcher.cbs.shift()

  return matcher 
}


var Matcher = function () {
  this.cbs = []          //collection of callbacks, the closest match first
  this.fn = null         //placeholder for best matching function
  this.perfect = false   //were we able to match an exact path, or did we only match partially?
  this.extras = []       //match regexp capture groups that isn't part of params
  this.params = {}       //colon args
}
Matcher.prototype.next = function () {
  this.fn = this.cbs.shift()
  if (this.fn) { this.fn.apply(this, Array.prototype.slice.call(arguments)) }
}

var _removeBeginEndSlash  = function (path) {
  var rtn = path.replace(/\/$/, '')
  rtn = rtn.replace(/^\//, '')
  return rtn
}


//EXPORTS
//exports.RouteTree = RouteTree
exports.RouteTree = RouteTree





