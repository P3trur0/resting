requirejs.config({
    baseUrl: 'js/vendor',
    paths: {
         app : '../app',
        'jquery': 'jquery-2.2.4.min',
        'knockout': 'knockout-3.4.2',
        'knockout-secure-binding': 'knockout-secure-binding',
        'localforage': 'localforage.nopromises.min',
        'hjls': 'highlight.pack'
    }
});

requirejs(['jquery','app/storage','knockout','knockout-secure-binding','hjls','app/request','app/bookmark','bootstrap'], function($,storage,ko,ksb,hjls,request,makeBookmarkProvider, bootstrap) {
  
  function BookmarkViewModel(bookmark) {
    const self = this;
    this.id = bookmark.id;
    this.name = bookmark.name;
    this.isFolder = bookmark.isFolder;
    this.folder = bookmark.folder;
    this.requestMethod = bookmark.request ? bookmark.request.method : null;
    this.requestUrl = bookmark.request ? bookmark.request.url : null;
    this.bookmarks = bookmark.bookmarks ? bookmark.bookmarks.map( b => new BookmarkViewModel(b)) : undefined;
    
    this.request = bookmark.request;
    this.viewName = function() {
        return self.name && self.name.length > 0 ? self.name :  self.requestMethod +' ' + self.requestUrl;
    };
  }

  function AppViewModel() {
    const Resting = {
      responseContent : {},
      bookmarkCopy: null,   // copy of bookmark object to use in edit comparison TO IMPROVE !!!!
      bookmarkLoaded: null, // this is the id of bookmark..bookmarkLoadedIdx duplication ??
      bookmarkLoadedIdx: -1,
      bookmarkToDelete: null,
      bookmarkToDeleteName : ko.observable(),
      tryToDeleteFolder: ko.observable(false),
      deleteChildrenBookmarks: ko.observable(false),
      requestMethod: ko.observable(),
      requestUrl: ko.observable(),
      responseBody: ko.observable(),
      callDuration: ko.observable('-'),
      callStatus: ko.observable('-'),
      responseHeaders: ko.observableArray(),
      requestHeaders: ko.observableArray(),
      querystring: ko.observableArray(),
      showRequestHeaders: ko.observable(true),
      showRequestBody: ko.observable(false),
      showQuerystring: ko.observable(false),
      showAuthentication: ko.observable(false),
      showResponseHeaders: ko.observable(false),
      showResponseBody: ko.observable(true),
      useFormattedResponseBody: ko.observable(true),
      useRawResponseBody: ko.observable(false), // is it used ??
      bodyType: ko.observable(),
      formDataParams: ko.observableArray(),
      formEncodedParams: ko.observableArray(),
      rawBody: ko.observable(),
      authenticationType: ko.observable(),
      username: ko.observable(),
      password: ko.observable(),
      bookmarks: ko.observableArray(),
      folders: ko.observableArray(),
      bookmarkName: ko.observable(),
      showBookmarkDialog: ko.observable(false),
      showFolderDialog: ko.observable(false),
      folderName: ko.observable(),
      folderSelected: ko.observable(),
      methods: ko.observableArray(['GET','POST','PUT','DELETE','HEAD','OPTIONS','CONNECT','TRACE','PATCH']),
      showBookmarkDeleteDialog: ko.observable(false)
    };

    
    const bookmarkProvider = makeBookmarkProvider(storage);

    const convertToFormData = (data = []) =>
      data.reduce((acc, record) => {
        acc[record.name] = record.value;
        return acc;
      }, {});

    const serializeBookmark = (bookmarkObj) => {
      return bookmarkProvider.fromJson(JSON.stringify(bookmarkObj));
    }
    
   
    const convertToUrlEncoded = (data = []) =>
      data.map( param => `${param.name}=${param.value}`).join('&');

    const updateBody = (bodyType, body) => {
      if (bodyType === 'form-data') {
        return Resting.formDataParams(body);
      }

      if (bodyType === 'x-www-form-urlencoded') {
        return Resting.formEncodedParams(body);
      }

      return Resting.rawBody(body);
    };

    const parseRequest = (req) => {
      Resting.requestMethod(req.method);
      Resting.requestUrl(req.url);
      Resting.bodyType(req.bodyType);
      Resting.requestHeaders(req.headers);
      Resting.querystring(req.querystring ?  req.querystring : []);
      _updateAuthentication(req.authentication);
      updateBody(req.bodyType, req.body);
    };

    const _updateAuthentication = authentication => {
     if(authentication) {
        Resting.authenticationType(authentication.type);
        Resting.username(authentication.username);
        Resting.password(authentication.password);
      }
    };
    
    const dataToSend = () => {
      if (Resting.bodyType() === 'form-data') {
        return convertToFormData(Resting.formDataParams());
      }

      if (Resting.bodyType() === 'x-www-form-urlencoded') {
        return convertToUrlEncoded(Resting.formEncodedParams());
      }

      return Resting.rawBody().trim();
    };

    const _authentication = () => ({type: Resting.authenticationType(), username: Resting.username(), password: Resting.password()});

    const body = (bodyType) => {
      if (bodyType === 'form-data') {
        return Resting.formDataParams();
      }

      if (bodyType === 'x-www-form-urlencoded') {
        return Resting.formEncodedParams();
      }

      return Resting.rawBody();
    };


    const validateBookmarkName = (name) => {
      if(name && name.trim().length > 0) {
        return name.trim();
      } else {
        return;
      }
    };

    const _saveBookmark = bookmark => {
       if(Resting.bookmarkLoaded) {
          // if edit a bookmark
          if(bookmark.folder) {
            const oldFolder = Resting.bookmarkCopy.folder;
            if(oldFolder == bookmark.folder) { // folderA to folderA
              let folderObj = Resting.bookmarks().find(b => b.id === bookmark.folder);
              const modifiedFolder = bookmarkProvider.replaceBookmark(folderObj, new BookmarkViewModel(bookmark)); 
              bookmarkProvider.save(serializeBookmark(modifiedFolder));
              Resting.bookmarks.replace(folderObj, modifiedFolder);
            } else if(!oldFolder) { //from no-folder to folderA
              const oldBookmark = Resting.bookmarks().find(b => b.id == bookmark.id); // I need the ref to bookmark saved in observable array 
                                                                                        //  either it is not removed from it
              deleteBookmark(oldBookmark);
              let folderObj = Resting.bookmarks().find(b => b.id === bookmark.folder);
              const modifiedFolder = bookmarkProvider.replaceBookmark(folderObj, new BookmarkViewModel(bookmark)); 
              bookmarkProvider.save(serializeBookmark(modifiedFolder));
              Resting.bookmarks.replace(folderObj, modifiedFolder);
            } else if( oldFolder != bookmark.folder) { // from folderA to folderB
              deleteBookmark(Resting.bookmarkCopy);
              let folderObj = Resting.bookmarks().find(b => b.id === bookmark.folder);
              const modifiedFolder = bookmarkProvider.replaceBookmark(folderObj, new BookmarkViewModel(bookmark)); 
              bookmarkProvider.save(serializeBookmark(modifiedFolder));
              Resting.bookmarks.replace(folderObj, modifiedFolder);
            }
          } else {  
            if(Resting.bookmarkCopy.folder) { // from folderA to no-folder
              deleteBookmark(Resting.bookmarkCopy);
              Resting.bookmarks.push(new BookmarkViewModel(bookmark));
            } else { // from no-folder to no-folder 
              const oldBookmark = Resting.bookmarks().find(b => b.id === bookmark.id);
              Resting.bookmarks.replace(oldBookmark, new BookmarkViewModel(bookmark));
            }
            bookmarkProvider.save(serializeBookmark(bookmark));
          }
        
          Resting.bookmarkCopy = null;   
          Resting.bookmarkLoaded = null;
          Resting.bookmarkLoadedIdx = -1;
          Resting.folderSelected('');
        } else { // if new bookmark
          if(bookmark.folder) {
            let folderObj = Resting.bookmarks().find(b => b.id === bookmark.folder);
            const modifiedFolder = bookmarkProvider.addBookmarks(folderObj, new BookmarkViewModel(bookmark));
            bookmarkProvider.save(serializeBookmark(modifiedFolder));
            Resting.bookmarks.replace(folderObj, modifiedFolder);
          } else {
             bookmarkProvider.save(serializeBookmark(bookmark));
             Resting.bookmarks.push(new BookmarkViewModel(bookmark));
          }
        }
    };
    
    const saveBookmark = () => {
      const req = request.makeRequest(
        Resting.requestMethod(), Resting.requestUrl(),
        Resting.requestHeaders(), Resting.querystring(), Resting.bodyType(),
        body(Resting.bodyType()),_authentication());
      const bookmarkId = Resting.bookmarkLoaded ? Resting.bookmarkLoaded : new Date().toString(); 
      const bookmarkObj = bookmarkProvider.makeBookmark(bookmarkId, req, validateBookmarkName(Resting.bookmarkName()), Resting.folderSelected());
      _saveBookmark(bookmarkObj);
      
      // close the dialog
      dismissSaveBookmarkDialog();
    };

    const deleteBookmark = (bookmark, deleteChildrenBookmarks) => {
      if(bookmark.folder) {
        const containerFolder = Resting.bookmarks().find( b => b.id === bookmark.folder);
        let modifiedFolder = Object.assign({},containerFolder);
        modifiedFolder.bookmarks = containerFolder.bookmarks.filter(b => b.id !== bookmark.id);
        bookmarkProvider.save(serializeBookmark(modifiedFolder));
        Resting.bookmarks.replace(containerFolder,modifiedFolder);
      } else {
        if(bookmark.isFolder && !deleteChildrenBookmarks) {
          const childrenBookmarks = bookmark.bookmarks.map( child => {
            child.folder=null;
            return child;
          });
          childrenBookmarks.forEach(child => _saveBookmark(child));
        }
        storage.deleteById(bookmark.id, () => Resting.bookmarks.remove(bookmark));
      }
    };

    const convertToHeaderObj = headersList =>
      headersList.reduce((acc, header) => {
        acc[header.name] = header.value;
        return acc;
      }, {});


    const displayResponse = (response) => {
      Resting.responseHeaders.removeAll();
      Resting.callDuration(`${response.duration}ms`);
      Resting.callStatus(response.status);
      response.headers.forEach(header => Resting.responseHeaders.push(header));
      Resting.responseContent = response.content;
      if(Resting.useFormattedResponseBody()) {
        Resting.responseBody(JSON.stringify(response.content,null,2));
        highlight();
      } else {
        Resting.responseBody(JSON.stringify(response.content));
      }
    };

    const send = () => {
      request.execute(Resting.requestMethod(),Resting.requestUrl(),convertToHeaderObj(Resting.requestHeaders()), Resting.querystring(), Resting.bodyType(),Resting.dataToSend(), 
      _authentication(),displayResponse);
    };

    const requestHeadersPanel = () => {
      Resting.showRequestHeaders(true);
      Resting.showRequestBody(false);
      Resting.showQuerystring(false);
      Resting.showAuthentication(false);
    };

    const requestBodyPanel = () => {
      Resting.showRequestHeaders(false);
      Resting.showRequestBody(true);
      Resting.showQuerystring(false);
      Resting.showAuthentication(false);
    };

    const querystringPanel = () => {
      Resting.showRequestHeaders(false);
      Resting.showRequestBody(false);
      Resting.showQuerystring(true);
      Resting.showAuthentication(false);
    };
    
    const authenticationPanel = () => {
      Resting.showRequestHeaders(false);
      Resting.showRequestBody(false);
      Resting.showQuerystring(false);
      Resting.showAuthentication(true);
    };
    
    const responseHeadersPanel = () => {
      Resting.showResponseHeaders(true);
      Resting.showResponseBody(false);

      // close jquery accordion
      $('#collapseOne').collapse('hide');
    };

    const responseBodyPanel = () => {
      Resting.showResponseBody(true);
      Resting.showResponseHeaders(false);
    };

    const formattedResponseBody = () => {
      Resting.useFormattedResponseBody(true);
      Resting.useRawResponseBody(false);
      Resting.responseBody(JSON.stringify(Resting.responseContent,null,2));
      highlight();
    };

    const rawResponseBody = () => {
      Resting.useFormattedResponseBody(false);
      Resting.useRawResponseBody(true);
      Resting.responseBody(JSON.stringify(Resting.responseContent));
      unhighlight();
    };
    
    const saveBookmarkDialog = () => {
      Resting.showBookmarkDialog(true);
    };
    
    const dismissSaveBookmarkDialog = () => {
      Resting.showBookmarkDialog(false);
      Resting.bookmarkName('');
    };
    
    const unhighlight = () => {
      $('#highlighted-response').removeClass('hljs');
    };
    
    const highlight = () => {
      $('#highlighted-response').each(function(i, block) {
      hljs.highlightBlock(block);
      });
    };
    
    const callSendOnEnter = (data, event) => {
      const enter = 13;
      if(event.keyCode === enter) {
        send();
      }
    };
    
    Resting.parseRequest = parseRequest;
    Resting.dataToSend = dataToSend;
    Resting.send = send;
    Resting.saveBookmark = saveBookmark;
    Resting.deleteBookmark = deleteBookmark;
    Resting.requestBodyPanel = requestBodyPanel;
    Resting.responseBodyPanel = responseBodyPanel;
    Resting.formattedResponseBody = formattedResponseBody;
    Resting.requestHeadersPanel = requestHeadersPanel;
    Resting.responseHeadersPanel = responseHeadersPanel;
    Resting.querystringPanel = querystringPanel;
    Resting.authenticationPanel = authenticationPanel;
    Resting.rawResponseBody = rawResponseBody;
    Resting.saveBookmarkDialog = saveBookmarkDialog;
    Resting.dismissSaveBookmarkDialog = dismissSaveBookmarkDialog;
    Resting.callSendOnEnter = callSendOnEnter;
    
    // FIXME: not good to expose this internal function
    Resting._saveBookmark = _saveBookmark;
    return Resting;
  }

  // init application
  $(() => {
    const screenWidth = screen.width;
    const dialogLeftPosition = screenWidth / 2  - 200;
    $('div.dialog').css('left', dialogLeftPosition+'px');

    // seems that this below must be the last instructions to permit component to be registered
    ko.components.register('entry-list', {
      viewModel: { require: 'app/components/entry-list/component' },
      template: { require: 'text!app/components/entry-list/view.html' }
    });

    ko.components.register('request-body', {
      viewModel: { require: 'app/components/request-body/component' },
      template: { require: 'text!app/components/request-body/template.html' }
    });
    
     ko.components.register('bookmarks', {
      viewModel: { require: 'app/components/bookmarks/component' },
      template: { require: 'text!app/components/bookmarks/view.html' }
    });
    
    ko.components.register('authentication', {
      viewModel: { require: 'app/components/authentication/component' },
      template: { require: 'text!app/components/authentication/view.html' }
    });
    
    
   // Show all options, more restricted setup than the Knockout regular binding.
   var options = {
     attribute: "data-bind",        // default "data-sbind"
     globals: window,               // default {}
     bindings: ko.bindingHandlers,  // default ko.bindingHandlers
     noVirtualElements: false       // default true
   };

   ko.bindingProvider.instance = new ksb(options);
   
   ko.applyBindings(new AppViewModel());
  });
});
