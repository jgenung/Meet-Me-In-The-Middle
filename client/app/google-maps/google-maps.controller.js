'use strict';

angular.module('meetMeInTheMiddleApp')

  .config(['uiGmapGoogleMapApiProvider', function(uiGmapGoogleMapApiProvider){
    uiGmapGoogleMapApiProvider.configure({
      //provide api key if available
      v: '3.17',
      libraries: 'geometry,visualization,places'
    });
  }])

  .controller('MapsCtrl', ['$scope', '$q', '$http', '$location', 'Auth','uiGmapGoogleMapApi', 'uiGmapIsReady', 'MainFactory', 'SocketFactory',
    function ($scope, $q, $http, $location, Auth, uiGmapGoogleMapApi, uiGmapIsReady, MainFactory, SocketFactory) {
      var socket = io();
      SocketFactory.socket = socket;
      var geolocationAvailable;
      var center;
      var circleRadius;
      var bounds;
      var instanceMap;
      var userInfo;
      var maps;
      var directionsService;
      var directionsDisplay;
      var polyline;
      var infowindow;
      var service;
      var url = $location.$$path.split('/');
      var roomId = url[url.length - 1];
      var places_Nearby;

      $scope.map = { control: {}, center: { latitude: 40.1451, longitude: -99.6680 }, zoom: 4 };
      $scope.options = { scrollwheel: false, scaleControl: true, mapTypeControl: false };
      $scope.markers = {};
      $scope.place = {types:[], keywords:'', radius: ''};
      $scope.placesNearby = {};
      $scope.possibleMidup;
      $scope.voteLocations = {};
      $scope.voteLocationArr = [];
      $scope.likes;
      $scope.voteMarkers = {};
      $scope.votedPlacesNearby = {};
      $scope.test;
      $scope.scrollSettings = { scrollableHeight: '300px', scrollable: true, displayProp: 'label', idProp: 'type', externalIdProp: 'type', buttonClasses: 'btn-sm' };
      $scope.places = [
        { id: 1, type: 'amusement_park', label: 'Amusement Park'},
        { id: 2, type: 'art_gallery', label: 'Art Gallery'},
        { id: 3, type: 'aquarium', label: 'Aquarium'},
        { id: 4, type: 'bar', label: 'Bar'},
        { id: 5, type: 'bowling_alley', label: 'Bowling Alley'},
        { id: 6, type: 'bus_station', label: 'Bus Station'},
        { id: 7, type: 'cafe', label: 'Cafe'},
        { id: 8, type: 'casino', label: 'Casino'},
        { id: 9, type: 'food', label: 'Food'},
        { id: 10, type: 'hotel', label: 'Hotel'},
        { id: 11, type: 'restaurant', label: 'Restaurant'},
        { id: 12, type: 'library', label: 'Library'},
        { id: 13, type: 'movie', label: 'Movie Theater'},
        { id: 14, type: 'museum', label: 'Museum'},
        { id: 15, type: 'night_club', label: 'Night Club'},
        { id: 16, type: 'park', label: 'Park'},
        { id: 17, type: 'shopping_mall', label: 'Shopping Mall'},
        { id: 18, type: 'spa', label: 'Spa'},
        { id: 19, type: 'subway_station', label: 'Subway Station'},
        { id: 20, type: 'taxi_stand', label: 'Taxi Stand'},
        { id: 21, type: 'train_station', label: 'Train Station'},
        { id: 22, type: 'zoo', label: 'Zoo'}
      ];
      $scope.circle = {
        id: 1,
        radius: 1000, // need a default radius???
        stroke: {
          color: '#08B21F',
          weight: 2,
          opacity: 1
        },
        fill: {
          color: '#08B21F',
          opacity: 0.5
        },
        geodesic: true, // optional: defaults to false
        clickable: true, // optional: defaults to true
        visible: false, // optional: defaults to true
        control: {}
      };
      $scope.circle.draggable = true;
      $scope.circle.editable = true;
      $scope.circle.events = {
        dragend: function(circle){
          var center = circle.getCenter();
          var newCenter = {};
          newCenter.lat = center.k;
          newCenter.lng = center.D;
          circle.setCenter(newCenter);
        },
        radius_changed:  function(circle){
          circleRadius = circle.getRadius();
          $scope.circle.radius = circleRadius;
        }
      }

      /**
       * @desc creates a user room object
       * @returns {{roomId: *, user: {_id: *, name: *, coords: {latitude: string, longitude: string}, owner: boolean}, info: string, active: boolean}}
       */
      var createUserRoomObj = function() {
        var user = Auth.getCurrentUser();
        var userRoomObj = {
          roomId: roomId,
          user: {
            _id: user._id,
            name: user.name,
            coords: {
              latitude: "",  //if user already is in room and has coords, DB will ignore ""
              longitude: ""
            },
            owner: false
          },
          info: 'How awesome',
          active: true
        };
        console.log('userRoomObj is ', userRoomObj);
        return userRoomObj;
      };

      // receives user data after joining room and populates map
      socket.on('join-room-reply', function(userData) {
        //userData is object of objects; Each user object has imageUrl property for thumbnail
        for(var marker in userData) {
          if( userData[marker].coords.latitude !== "" && userData[marker].coords.longitude !== "" ) {
            addMarker(Number(userData[marker].coords.latitude), Number(userData[marker].coords.longitude), userData[marker].userId);
          }
        }
      });

      // 
      uiGmapGoogleMapApi.then(function(maps) {
        maps = maps;
        $scope.googleVersion = maps.version;
        geolocationAvailable = navigator.geolocation ? true : false;
        directionsService = new maps.DirectionsService();
        directionsDisplay = new maps.DirectionsRenderer();
        infowindow = new maps.InfoWindow();
        bounds = new maps.LatLngBounds();
        polyline = new maps.Polyline({
          path: [],
          strokeColor: '#FF0000',
          strokeWeight: 3
        });
        uiGmapIsReady.promise(1).then(function(instances) {
          instanceMap = instances[0].map;
          service = new maps.places.PlacesService(instanceMap);
          directionsDisplay.setMap(instanceMap);
          //after map has rendered, get data from DB for user markers
          //addUserToRoom is the HTTP post method which has issues showing midpoint and route, 
          //'join-room' is socket.io method to accomplish same thing
          socket.emit('join-room', createUserRoomObj());
        });
      });

      // allows for location search box functionality
      var events = {
        places_changed: function (searchBox) {
          var place = searchBox.getPlaces();
          if (!place || place == 'undefined' || place.length == 0) {
            console.log('no place data');
            return;
          }
          changeMapView(place[0].geometry.location.lat(), place[0].geometry.location.lng(), 18);
          addMarker(place[0].geometry.location.lat(), place[0].geometry.location.lng(), Auth.getCurrentUser()._id);
          $scope.$apply();
        }
      }
      $scope.searchbox = { template:'searchbox.tpl.html', events:events, position:"LEFT_BOTTOM"};
      
      // sends updated coordinates to all other clients in room
      socket.on('move-pin-reply', function(dataCollection){
        for(var marker in dataCollection){
          if(marker !== Auth.getCurrentUser()._id){
            addMarker(dataCollection[marker].coords.latitude, dataCollection[marker].coords.longitude, marker);
            $scope.$apply();
          }
        }
        socket.on('error', function(message) {
          console.log('error message is ', message);
        });
        if(Object.keys($scope.markers).length >= 2){
          if($scope.circle.center === undefined){
            calculateCenter();
            calcCircleCenter();
          }
          if($scope.markers[Auth.getCurrentUser()._id]){
            calculateCenter();
            calcCircleCenter();
            calcRoute();
          }
        }
      });

      //Listener for Add To Vote
      socket.on('addLoc-reply', function(locData) {
        $scope.voteLocations[locData.id] = locData;
        var found = 0;
        //Look for location in the array to see if it is already in the voting box
        for(var x = 0; x < $scope.voteLocationArr.length; x++){
          if($scope.voteLocationArr[x].id === locData.id){
            found = 1;
          }
        }
        //Add to the voting box and add markers
        if(!found){
          $scope.voteLocationArr.push($scope.voteLocations[locData.id]);
          if($scope.markers[locData.id]  !== undefined){
            delete $scope.markers[locData.id];
          }
          $scope.voteMarkers[locData.id] = JSON.parse($scope.voteLocations[locData.id].marker);
          $scope.votedPlacesNearby[locData.id] = $scope.voteLocations[locData.id].locInfo;
        }
        $scope.$apply();
      });

      //Listener for Likes and Unlikes
      socket.on('vote-reply', function(locData) {
        //Update info in the voting box
        $scope.voteLocations[locData.id] = locData;
        for(var x = 0; x < $scope.voteLocationArr.length; x++){
          if($scope.voteLocationArr[x].id === locData.id){
            $scope.voteLocationArr[x] = locData;
          }
        }
        $scope.$apply();
      });

      //Listener for vote data intializations on user entering a room
      socket.on('vote-data', function(locData){
        for(var x = 0; x < locData.length; x++){
          //Add the location and the appropriate markers
          $scope.voteLocations[locData[x].id] = locData[x];
          $scope.voteMarkers[locData[x].id] = JSON.parse($scope.voteLocations[locData[x].id].marker);
          $scope.voteMarkers[locData[x].id].showWindow = false;
          $scope.votedPlacesNearby[locData[x].id] = locData[x].locInfo;
        }
        $scope.voteLocationArr = locData;
        $scope.$apply();
      });


      /**
       * @desc searches for places with the given parameters from the maps page
       */
      $scope.placeSearch = function () {
        var place = $scope.place;
        if (!isNaN(Number(place.radius)) && Number(place.radius) > 0) {
          $scope.circle.radius = Number(place.radius);
        }
        if ($scope.circle.center) {
          var request = {
            location: {
              lat: $scope.circle.center.latitude,
              lng: $scope.circle.center.longitude
            },
            radius: $scope.circle.radius
          };
          if (place.types.length) {
            var types = [];
            place.types.forEach(function (x) {
              types.push(x.type);
            });
            request.types = types;
          }
          else if (place.keywords) {
            request.keyword = [place.keywords.toLowerCase()];
          }
          service.nearbySearch(request, function (results, status) {
            if (status == google.maps.places.PlacesServiceStatus.OK) {
              //Reset the place data for the new search
              places_Nearby = {};

              for (var i = 0; i < results.length; i++) {
                //Save the place data
                updatePlaces(results[i], results[i].id);
                //Add the icon to the map
                addPlace(results[i]);
              }
              
              //Save the place data to a scope variable
              $scope.placesNearby = places_Nearby;
              $scope.$apply();
            }
            else {
              alert("directions response " + status);
            }
          });
        }
      };

      // // 
      // socket.on('place-search-reply', function(request){
      //   //var request = { location: { lat: latitude, lng: longitude }, radius: radius, types: place };
      //   console.log('socket request: ', request);
      //   service.nearbySearch(request, function (results, status) {
      //     if (status == google.maps.places.PlacesServiceStatus.OK) {
      //       //Reset the places object
      //       places_Nearby = {};
      //       //places_Nearby = [];
      //       console.log('place results: ', results);
      //       for (var i = 0; i < results.length; i++) {
      //         //console.log(results[i]);
      //         //Update places object
      //         updatePlaces(results[i], results[i].id);
      //         // if(i === 0){ placeDetails(results[i].id); }
      //         addPlace(results[i]);
      //         // $scope.$apply();
      //       }
      //       //console.log(places_Nearby);
      //       $scope.placesNearby = places_Nearby;
      //       console.log("!@#$%^^&*: "+ $scope.placesNearby);
      //       $scope.$apply();
      //     }
      //     else{
      //       alert("directions response " +status);
      //     }
      //   });
      // });

      /**
       * @desc adds a place to the map
       * @param place - place to be added
       */
      var addPlace = function (place) {
        //Format the icon to be displayed
        var icon = {
          url: place.icon,
          origin: new google.maps.Point(0,0),
          anchor: new google.maps.Point(0, 0),
          scaledSize: new google.maps.Size(20, 20)
        };

        //Define the marker
        $scope.markers[place.id] = {
          icon: icon,
          _id: place.id,
          coords: {
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng()
          },
          //icon: icon,
          showWindow: false,
          name: place.name
        };
        $scope.$apply();
      };

      /**
       * @desc Function called to store data on locations
       * @param place Object - contains the data for a location
       * @param id String - contains the unique id for the location
       */
      var updatePlaces = function(place, id){
        //Categories in the place object that will be examined
        var placeInfo = ['name','photos', 'price_level', 'rating'];
        //Text that will be saved along with the data gathered from the place object
        var placeTags = ['','','Price Level: ','Rating: '];
        //Check to see if the location information has already been saved 
        if(places_Nearby[id] === undefined) {
          places_Nearby[id] = [];
          for(var x = 0; x < placeInfo.length ; x++){
            if(place[placeInfo[x]] !== undefined) {
              //Translate the Price Level of a location from a number to dollar signs
              if(placeTags[x] === 'Price Level: '){
                var y = place[placeInfo[x]];
                var cost = '';
                while(y > 0){
                  cost = cost + '$';
                  y--;
                }
                places_Nearby[id].push(placeTags[x] + cost);
              //Format the photo for the location 
              } else if(placeInfo[x] === 'photos') {
                places_Nearby[id].push(place[placeInfo[x]][0].getUrl({'maxWidth': 100, 'maxHeight': 100}));
              //Save the location information
              }else {
                places_Nearby[id].push(placeTags[x] + place[placeInfo[x]]);
              }
            //Deal with undefined fields
            } else {
              places_Nearby[id].push(placeTags[x] + 'None provided.')

            }
          }
          //Check opening hours
          if(place.opening_hours) {
            if(place.opening_hours.open_now){
              places_Nearby[id].push('Currently open.');
            } else {
              places_Nearby[id].push('Currently closed.');
            }
          }
        }
      };

      /**
       * @desc Function called when user click on the Like or Unlike button
       * @param locKey String  - Unique place ID for the location selected
       * @param likeType Number - 1 === Like, -1 === Unlike
       */
      $scope.vote = function (locKey, likeType) {
        //Get the user's ID
        var userId = Auth.getCurrentUser()._id;
        //Count the users vote
        socket.emit('vote', roomId, likeType, userId, $scope.voteLocations[locKey]);
      };

      /**
       * @desc Function called when user clicks Add To Vote button
       * @param locKey String - Unique place ID for the location selected
       */
      $scope.addToVote = function (locKey) {
        //Get the user's ID
        var userId = Auth.getCurrentUser()._id;
        //Check to see if the location has already been added to the MidUps to Vote On box
        if($scope.voteLocations[locKey] !== undefined){
          //If it is already in the MidUps to Vote On Box, check to see if the user has already voted on it
          if(!(_.contains($scope.voteLocations[locKey].voters,userId))){
            //Count the users vote
            socket.emit('vote', roomId, 1, userId, $scope.voteLocations[locKey]);
          }
        } else {
        //The location has not be added to the voting box, put together it's data
          var locData =
          {
            id: locKey,
            name: $scope.placesNearby[locKey][0],
            votes: 1,
            voters: [userId],
            marker: JSON.stringify($scope.markers[locKey]),
            locInfo: $scope.placesNearby[locKey]
          };
          //Add the new location to the voting box
          socket.emit('addLoc', roomId, locData, userId);
        }
      };

      /**
       * @desc closes the popup window for a marker
       * @param marker - marker to close window on
       */
      $scope.closeClick = function (marker) {
        marker.showWindow = false;
      };

      /**
       * @desc opens the popup window for a marker
       * @param marker - marker to open window on
       */
      $scope.onMarkerClick = function (marker) {
        //Added if else statement for ng-click call from Possible MidUps
        if(marker.showWindow === false){
          marker.showWindow = true;
        } else {
          $scope.closeClick(marker);
        }
      };

      /**
       * @desc geolocation ability to find current location
       */
      $scope.findMe = function () {
        if(geolocationAvailable) {
          navigator.geolocation.getCurrentPosition(function (position) {
            changeMapView(position.coords.latitude, position.coords.longitude, 18);
            addMarker(position.coords.latitude, position.coords.longitude, Auth.getCurrentUser()._id);
            $scope.$apply();
          }, function () {});
        }
        else{
          alert('geolocation not ready!');
        }
      };

      /**
       * @desc changes the map view to include the entire US
       */
      $scope.viewMap = function(){
        changeMapView(40.1451, -99.6680, 4);
      };

      /**
       * @desc 
       * @param placeId
       */
      var placeDetails = function(placeId){
        var request = {
          placeId: placeId
        };
        console.log(request);
        service.getDetails(request, function(place, status) {
          if (status == google.maps.places.PlacesServiceStatus.OK) {
            //createMarker(place);
          }
          else{
            alert("service get details response "+status);
          }
        });
      };

      /**
       * @desc extends the bounds of the map view and calculates the center
       * @param latitude
       * @param longitude
       */
      var extendBounds = function(latitude, longitude){
        var coord = new google.maps.LatLng(latitude, longitude);
        bounds.extend(coord);
        center = bounds.getCenter();
      };

      /**
       * @desc calculates the center for the circle object
       */
      var calcCircleCenter = function(){
        var circleCenter = {};
        circleCenter.latitude = center.k;
        circleCenter.longitude = center.D;
        $scope.circle.center = circleCenter;
        $scope.circle.visible = true;
        $scope.$apply();
      };

      /**
       * @desc calculates the center
       */
      var calculateCenter = function(){
        bounds = new google.maps.LatLngBounds();
        for(var marker in $scope.markers){
          var coord = new google.maps.LatLng($scope.markers[marker].coords.latitude, $scope.markers[marker].coords.longitude);
          bounds.extend(coord);
        }
        center = bounds.getCenter();
      };

      /**
       * @desc calculates the route to the center
       */
      var calcRoute = function(){
        var request = {
          origin: new google.maps.LatLng($scope.markers[Auth.getCurrentUser()._id].coords.latitude, $scope.markers[Auth.getCurrentUser()._id].coords.longitude),
          destination: center,
          travelMode: google.maps.TravelMode.DRIVING
        };
        directionsService.route(request, function(response, status) {
          if (status == google.maps.DirectionsStatus.OK) {
            directionsDisplay.setDirections(response);
          } else {
            alert("directions response "+status);
          }
        });
      };

      /**
       * @desc calculates the route between two users and places a midpoint
       * @param start
       * @param end
       */
      var calcRoute2Users = function(start, end){
        polyline.setPath([]);
        removeMarker('midpoint');
        var request = {
          origin: new google.maps.LatLng($scope.markers[start].coords.latitude, $scope.markers[start].coords.longitude),
          destination: new google.maps.LatLng($scope.markers[end].coords.latitude, $scope.markers[end].coords.longitude),
          travelMode: google.maps.TravelMode.DRIVING
        };

        directionsService.route(request, function(response, status){
          if(status === google.maps.DirectionsStatus.OK){
            directionsDisplay.setDirections(response);
            var totalDist = 0;
            var totalTime = 0;
            var route = response.routes[0];
            var path = route.overview_path;
            var legs = route.legs;
            for(var i = 0; i < legs.length; i++){
              totalDist += legs[i].distance.value;
              totalTime += legs[i].duration.value;
              var steps = legs[i].steps;
              for(var j = 0; j < steps.length; j++){
                var nextSegment = steps[j].path;
                for(var k = 0; k < nextSegment.length; k++){
                  polyline.getPath().push(nextSegment[k]);
                  bounds.extend(nextSegment[k]);
                }
              }
            }
            var distance = (50/100) * totalDist;
            var time = ((50/100) * totalTime/60).toFixed(2);
            var coordinates = polyline.GetPointAtDistance(distance);
            addMarker(coordinates.k, coordinates.D, 'midpoint');
            $scope.$apply();
          } else{
            alert("directions response " +status);
          }
        });
      };
      var userImage = {
        url: '../../assets/images/skoPic.PNG',
        scaledSize : new google.maps.Size(40, 40),
        origin: new google.maps.Point(0,0),
        anchor: new google.maps.Point(20, 40),
      };

      /**
       * @desc adds a marker to the marks object and gets places on the map
       * @param latitude - latitude for marker location
       * @param longitude - longitude for marker location
       * @param id - unique id for marker, should be the users id
       */
      var addMarker = function (latitude, longitude, id) {
        if(id === Auth.getCurrentUser()._id){
          $scope.markers[id] = {
            _id: Auth.getCurrentUser()._id,
            roomId: roomId,
            icon: userImage,
            name: Auth.getCurrentUser().name,
            coords:{
              latitude: latitude,
              longitude: longitude
            },
            info: '',
            options:{
              draggable: true
            },
            events: {
              dragend: function(marker, eventName, args){
                console.log('marker dragend event fired once data sent: \n' + JSON.stringify($scope.markers[Auth.getCurrentUser()._id], null, 2));
                socket.emit('move-pin', $scope.markers[Auth.getCurrentUser()._id]);
              }
            }
          }
          socket.emit('move-pin', $scope.markers[Auth.getCurrentUser()._id]);
        }else{
          $scope.markers[id] = {
            _id: id,
            roomId: roomId,
            icon: 'http://www.googlemapsmarkers.com/v1/0099FF/',
            coords:{
              latitude: latitude,
              longitude: longitude
            },
            options:{},
            events: {}
          }
        }
      };

      /**
       * @desc removes a specific marker from the map
       * @param id - unique identification for the marker that is to be removed
       */
      var removeMarker = function (id) {
        delete $scope.markers[id];
        $scope.$apply();
      };

      /**
       * @desc removes all markers from the map
       */
      var removeAllMarkers = function () {
        for(var marker in $scope.markers){
          delete $scope.markers[marker];
        }
      };

      /**
       * @desc removes directions from map
       */
      var removeDirections = function () {
        directionsDisplay.setMap(null);
        directionsDisplay.setMap(instanceMap);
      };

      /**
       * @desc removes polyline from map
       */
      var removePolylines = function () {
        polyline.setPath([]);
      };

      /**
      * @desc clears map of all markers, directions, and polylines
      */
      $scope.clearMap = function(){
        removeAllMarkers();
        removeDirections();
        removePolylines();
      };

      /**
       * @desc adds several markers to the map at once
       * @param data - an object containing marker objects
       */
      var addAllMarkers = function (data) {
        for(var marker in data){
          $scope.markers[marker] = data[marker];
        }
      };

      /**
       * @desc change map view to focus on a specific point with a specific zoom
       * @param latitude - the latitude for the view to focus on
       * @param longitude - the longitude for the view to focus on
       * @param zoom - sets the zoom parameter for the map view
       */
      var changeMapView = function (latitude, longitude, zoom) {
        $scope.map = {
          control: {},
          center: {
            latitude: latitude,
            longitude: longitude
          },
          zoom: zoom
        }
      };

      $scope.slide = false;

      /**
       *
       */
      $scope.slider = function (){
        $scope.slide = !$scope.slide;
        var map = document.querySelector('.angular-google-map-container');
        var searchBox = document.querySelector('#pac-input');
        var gmapNav = document.querySelector('#gmap-nav');
        var gmapFindMe = document.querySelector('.gmap-find-me');
        var mapWidth = parseInt(window.getComputedStyle(map).width);
        var bodyWidth = parseInt(window.getComputedStyle(document.body).width);
        var ratio = mapWidth / bodyWidth;
        if(ratio < .9){
          map.style.width = '100%';
          searchBox.style.marginLeft = '2%';
          gmapNav.style.top = '-50px';
          gmapFindMe.style.left = '80px';
        } else {
          map.style.width = '88%';
          searchBox.style.marginLeft = '10%';
          gmapNav.style.top = '0';
          gmapFindMe.style.left = '21%';
        }
      }
    }]);
