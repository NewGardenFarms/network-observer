// import leaflet
import leaflet from 'leaflet';
import hash from 'leaflet-hash';
import 'leaflet/dist/leaflet.css';

// d3 libraries
import * as d3_Selection from 'd3-selection';
import {scaleLinear} from 'd3-scale';
import {timeMinute} from 'd3-time';
import {timeFormatLocale, timeParse} from 'd3-time-format';
import {interpolateRgb} from 'd3-interpolate';
import {dsv} from 'd3-fetch'; //DE-COMMENTER SI VERSION SERVER
import {dsvFormat} from 'd3-dsv';

const d3 = Object.assign({}, d3_Selection);

import api from './feinstaub-api';
import labs from './labs.js';
import wind from './wind.js';
import * as config from './config.js';

import '../css/style.css';
import * as places from './places.js';
import * as zooms from './zooms.js';
import * as translate from './translate.js';

// favicon config
import './static-files';

let SC_Values = {"type": "FeatureCollection","name": "SCSensors","crs": { "type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84" }},"features": []};

// save browser lanuage for translation
const lang = translate.getFirstBrowserLanguage().substring(0, 2);

let timestamp_data = '';			// needs to be global to work over all 4 data streams
let timestamp_from = '';			// needs to be global to work over all 4 data streams

const locale = timeFormatLocale({
	"dateTime": "%Y.%m.%d %H:%M:%S",
	"date": "%d.%m.%Y",
	"time": "%H:%M:%S",
	"periods": ["AM", "PM"],
	"days": ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
	"shortDays": ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."],
	"months": ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
	"shortMonths": ["Jan.", "Feb.", "Mar.", "Apr.", "Mai", "Jun.", "Jul.", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."]
});

const scale_options = {
	"PM10": {
		valueDomain: [-1,0, 20, 40, 60, 100, 500],
		colorRange: ['#808080','#00796B','#00796B', '#F9A825', '#E65100', '#DD2C00', '#960084']
	},
	"PM25": {
		valueDomain: [-1,0, 10, 20, 40, 60, 100],
		colorRange: ['#808080','#00796B','#00796B', '#F9A825', '#E65100', '#DD2C00', '#960084']
  },
  	"PM1": {
		valueDomain: [-1,0, 10, 20, 40, 60, 100],
		colorRange: ['#808080','#00796B','#00796B', '#F9A825', '#E65100', '#DD2C00', '#960084']
  },
  "Temperature": {
		valueDomain: [-20, -10, 0, 10, 20, 30, 40],
		colorRange: ['#4050B0', '#5679f9', '#55cbd9', '#a2cf4a', '#fedb64', '#fe8f52', '#e6380f']
	},
	"Humidity": {
		valueDomain: [0, 20, 40, 60, 80, 100],
		colorRange: ['#c41a0a', '#f47a0b', '#f4e60b', '#aff474', '#6dbcff', '#00528f']
	},
	"Pressure": {
		valueDomain: [926, 947.75, 969.50, 991.25, 1013, 1034.75, 1056.50, 1078.25, 1100],
		colorRange: ["#dd2e97", "#6b3b8f", "#2979b9", "#02B9ed", "#13ae52", "#c9d841", "#fad635", "#f0a03d", "#892725"]
	}
};

const map = L.map('map', {zoomControl: true, minZoom: config.minZoom, maxZoom: config.maxZoom, doubleClickZoom: false});

var data_host = "";
data_host = "https://maps.sensor.community";
config.tiles = config.tiles_server + config.tiles_path;

console.log(config.tiles);

const tiles = L.tileLayer(config.tiles, {
	attribution: config.attribution,
	maxZoom: config.maxZoom,
	minZoom: config.minZoom,
	subdomains: config.tiles_subdomains
}).addTo(map);

new L.Hash(map);

document.getElementById("menu").addEventListener("click", toggleSidebar);


// define query object
const query = {
	nooverlay: "false",
	nowind: "false",
	nolabs: "false",
	noeustations: "false",
	selection: config.selection
};
// iife function to read query parameter and fill query object
(function () {
	let telem;
	const search_values = location.search.replace('\?', '').split('&');
	for (let i = 0; i < search_values.length; i++) {
		telem = search_values[i].split('=');
		query[telem[0]] = '';
		if (typeof telem[1] != 'undefined') query[telem[0]] = telem[1];
	}
})();

// layers
if (query.nowind === "false") { config.layer_wind = 1 } else {config.layer_wind = 0;}
if (query.nolabs === "false") { config.layer_labs = 1 } else {config.layer_labs = 0;}
if (query.noeustations === "false") { config.layer_eustations = 1 } else {config.layer_eustations = 0;}

// show betterplace overlay
if (query.nooverlay === "false") d3.select("#betterplace").style("display", "inline-block");
d3.select("#loading").html(translate.tr(lang,d3.select("#loading").html()));
config.selection = (query.sensor !== undefined) ? query.sensor : config.selection;
d3.select("#custom-select").select("select").property("value", config.selection);

let user_selected_value = config.selection;
let coordsCenter = config.center;
let zoomLevel = config.zoom;

if (location.hash) {
	const hash_params = location.hash.split("/");
	coordsCenter = [hash_params[1], hash_params[2]];
	zoomLevel = hash_params[0].substring(1);
} else {
	const hostname_parts = location.hostname.split(".");
	if (hostname_parts.length === 4) {
		const place = hostname_parts[0].toLowerCase();
		if (typeof places[place] !== 'undefined' && places[place] !== null) {
			coordsCenter = places[place];
			zoomLevel = 11;
		}
		if (typeof zooms[place] !== 'undefined' && zooms[place] !== null) zoomLevel = zooms[place];
	}
}

const colorScalePM1 = scaleLinear()
    .domain(scale_options.PM1.valueDomain)
    .range(scale_options.PM1.colorRange)
    .interpolate(interpolateRgb);

const colorScalePM10 = scaleLinear()
    .domain(scale_options.PM10.valueDomain)
    .range(scale_options.PM10.colorRange)
    .interpolate(interpolateRgb);
              
const colorScalePM25 = scaleLinear()
    .domain(scale_options.PM25.valueDomain)
    .range(scale_options.PM25.colorRange)
    .interpolate(interpolateRgb);

const colorScaleHumidity = scaleLinear()
    .domain(scale_options.Humidity.valueDomain)
    .range(scale_options.Humidity.colorRange)
  .interpolate(interpolateRgb);
    
const colorScaleTemperature = scaleLinear()
    .domain(scale_options.Temperature.valueDomain)
    .range(scale_options.Temperature.colorRange)
    .interpolate(interpolateRgb);

const colorScalePressure = scaleLinear()
    .domain(scale_options.Pressure.valueDomain)
    .range(scale_options.Pressure.colorRange)
    .interpolate(interpolateRgb);
     
var SCSensorsMap = L.geoJSON(SC_Values,{
                      pointToLayer: function (feature, latlng) {
                       return L.circleMarker(latlng, {
                        radius:10,
                        fillColor: colorScaler(user_selected_value,feature.properties.data),
                        weight:2,
                        stroke:strokeSelect(feature.properties.type),
                        color :'red',
                        fillOpacity: 1})
                      },
  onEachFeature: function (feature, layer) {

    if (feature.properties.data != null) {
      var link1 = "https://maps.sensor.community/#16/"+ feature.properties.lat +"/"+ feature.properties.lon ;
      switch (user_selected_value) {
        case "PM10":
          var txtSel = "PM10";
          var key = "PM10";
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
          break;
        case "PM25":
          var txtSel = "PM2.5";
          var key = "PM25";
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=12";
          break;
        case "PM1":
          var txtSel = "PM1";
          var key = "PM1";
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=2";
          break;
        case "Humidity":
          var txtSel = "Humidité relative";
          var key = "Humidity";
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
          break;
        case "Temperature":
          var txtSel = "Température";
          var key = "Temperature";
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=2";
          break;
        case "Pressure":
          var txtSel = "Pression atmosphérique";
          var key = "Pressure";
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=4";
          break;
      }

      var popupContent = "<h2>Capteur Respire</h2></h2><p><b>ID API</b> :  <a target='_blank' href='" + link1 + "'>"+ feature.properties.id + "</a></p><p><b>ID ESP</b> : <a target='_blank' href='" + link2 + "'>" + feature.properties.esp + "</a></p><p><b>Nom</b> : " + feature.properties.nom + "</p><p><b>Prénom</b> : " + feature.properties.prenom + "</p><p><b>Adresse</b> : " + feature.properties.adresse + "</p><p><b>Courriel</b> : <a href='mailto:" + feature.properties.email + "'>" + feature.properties.email + "</a></p><p><b>" + txtSel + "</b> : " + feature.properties.data[key] + "</p><div><iframe src='"+ link3 +"' width='380' height='250' frameborder='0'></iframe></div>";
    } else if (feature.properties.type == "PM" || feature.properties.data == "THP") {
      switch (user_selected_value) {
        case "PM10":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
          break;
        case "PM25":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=12";
        break;
        case "PM1":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=2";
          break;
        case "Humidity":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
          break;
        case "Temperature":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp + "&panelId=2";
          break;
        case "Pressure":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=4";
          break;
      }
        var popupContent = "<h2>Capteur Respire</h2></h2><p><b>ID API</b> : " + feature.properties.id + "</p><p><b>ID ESP</b> : <a target='_blank' href='" + link2 + "'>" + feature.properties.esp + "</a></p><p><b>Nom</b> : " + feature.properties.nom + "</p><p><b>Prénom</b> : " + feature.properties.prenom + "</p><p><b>Adresse</b> : " + feature.properties.adresse + "</p><p><b>Courriel</b> : <a href='mailto:" + feature.properties.email + "'>" + feature.properties.email + "</a></p><p><b>Pas de donnée</b></p><div><iframe src='"+ link3 +"' width='380' height='250' frameborder='0'></iframe></div>";
    } else {
            switch (user_selected_value) {
        case "PM10":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
          break;
        case "PM25":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=12";
          break;
        case "PM1":
          var link2 = "https://api-rrd.madavi.de/grafana/d/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/GUaL5aZMz/pm-sensors?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=2";
          break;
        case "Humidity":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=3";
         break;
        case "Temperature":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp + "&panelId=2";
          break;
        case "Pressure":
          var link2 = "https://api-rrd.madavi.de/grafana/d/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-" + feature.properties.esp;
          var link3 = "https://api-rrd.madavi.de/grafana/d-solo/q87EBfWGk/temperature-humidity-pressure?orgId=1&var-chipID=esp8266-"+ feature.properties.esp +"&panelId=4";
          break;
      }
        var popupContent = "<h2>Capteur Respire</h2></h2><p><b>ID API</b> : indisponible </p><p><b>ID ESP</b> : <a target='_blank' href='" + link2 + "'>" + feature.properties.esp + "</a></p><p><b>Nom</b> : " + feature.properties.nom + "</p><p><b>Prénom</b> : " + feature.properties.prenom + "</p><p><b>Adresse</b> : " + feature.properties.adresse + "</p><p><b>Courriel</b> : <a href='mailto:" + feature.properties.email + "'>" + feature.properties.email + "</a></p><p><b>Capteur non-enregistré</b></p><div><iframe src='"+ link3 +"' width='380' height='250' frameborder='0'></iframe></div>";
    };
  layer.bindPopup(popupContent, { closeOnClick: false, autoClose: false, closeButton: true });
                      }}).addTo(map);

var respireSensors = [];

var loaded = false;

window.onload = function () {
    
	//	Select
	const custom_select = d3.select("#custom-select");
	custom_select.select("select").property("value", config.selection);
	custom_select.select("select").selectAll("option").each(function () {
		d3.select(this).html(translate.tr(lang, d3.select(this).html()));
	});
	custom_select.append("div").attr("class", "select-selected").html("<span>"+translate.tr(lang,
		custom_select.select("select").select("option:checked").html())+"</span>").on("click", showAllSelect);
	custom_select.style("display", "inline-block");

	switchLegend(user_selected_value);

	map.setView(coordsCenter, zoomLevel);
  map.clicked = 0;
  
  d3.select("#loading_layer").style("display", "none");
  
  d3.select("#input").on("input", function () {
    d3.select("#loading_layer").style("display", "block"); 
    readFile(document.getElementById('input').files[0]).then(function (data) {
      console.log(data);
      loaded = true;
      retrieveData(data);
    })

  });
 

  setInterval(function () {
    if (loaded == true){
    SCSensorsMap.clearLayers();
    retrieveData(respireSensors);
    }
	}, 300000);

	map.on('moveend', function () {
	});

	map.on('click', function (e) {
		/* if the user clicks anywhere outside the opened select drop down, then close all select boxes */
		if (! d3.select("#custom-select").select(".select-items").empty()) {
			d3.select("#custom-select").select(".select-items").remove();
			d3.select("#custom-select").select(".select-selected").attr("class", "select-selected");
		} else {
			setTimeout(function () {
				map.setView([e.latlng.lat, e.latlng.lng], map.getZoom());
			}, 300);
		}
		clicked = null;
	});
    
	map.on('dblclick', function () {
		map.zoomIn();
		clicked += 1;
	});
    
	// Load lab and windlayer, init checkboxes
	if (config.layer_labs) {
		d3.select("#cb_labs").property("checked", true);
	} else {
		d3.select("#cb_labs").property("checked", false);
	}
	
	if (config.layer_wind) {
		d3.select("#cb_wind").property("checked", true);
	} else {
		d3.select("#cb_wind").property("checked", false);
	}

	labs.getData(data_host + "/local-labs/labs.json", map);
	wind.getData(data_host + "/data/v1/wind.json", map, switchWindLayer);
	
	d3.select("#label_local_labs").html(translate.tr(lang, "Local labs"));
	d3.select("#label_wind_layer").html(translate.tr(lang, "Wind layer"));

	switchLabLayer();
	switchWindLayer();
	d3.select("#cb_labs").on("change", switchLabLayer);
	d3.select("#cb_wind").on("change", switchWindLayer);
    
  
  map.on('popupopen', function(e){})
};

function strokeSelect(value) {
  if (value == "PM" || value =="THP") {
    return false
  } else {
    return true
  }
 }

function colorScaler(option,value){
  
  if (typeof value == 'object') {
        
    if (value != null) {
          
        if(option == "PM10"){return colorScalePM10(value.PM10);};  
        if(option == "PM25"){return colorScalePM25(value.PM25);};  
        if (option == "PM1") { return colorScalePM1(value.PM1); };
        if(option == "Humidity"){return colorScaleHumidity(value.Humidity);};  
        if(option == "Pressure"){return colorScalePressure(value.Pressure);};  
        if(option == "Temperature"){return colorScaleTemperature(value.Temperature);};  
        }else{
            return 'grey';
        }
        
     }else if (typeof value == 'number'){ 
      if(option == "PM10"){ return colorScalePM10(value);};
      if (option == "PM25") { return colorScalePM25(value); };
      if (option == "PM1") { return colorScalePM1(value); };
      if(option == "Humidity"){ return colorScaleHumidity(value);};
      if (option == "Pressure") { return colorScalePressure(value); };
      if(option == "Temperature"){return colorScaleTemperature(value);};
     }else {return 'grey';};
};

function retrieveData(data) {
    
  var urlapi = "https://data.sensor.community/static/v2/data.json";
  

  api.getData(urlapi).then(function (result) {
          
      
        if (result.timestamp > timestamp_data) {
            timestamp_data = result.timestamp;
            timestamp_from = result.timestamp_from;
        }

const dateParser = timeParse("%Y-%m-%d %H:%M:%S");
const timestamp = dateParser(timestamp_data);
const localTime = new Date();
const timeOffset = localTime.getTimezoneOffset();
const newTime = timeMinute.offset(timestamp, -(timeOffset));
const dateFormater = locale.format("%H:%M:%S");

d3.select("#update").html(translate.tr(lang, "Last update") + ": " + dateFormater(newTime));
console.log("Timestamp " + timestamp_data + " from " + timestamp_from);
        
    var mapper = data.map(function (obj) {
            
      if (result.cells.some(el => el.id.toString() == obj.idapi) && obj.type != "X") {

        var SCfeature = { "type": "Feature", "properties": { "esp": 0, "email": "", "adresse": "", "nom": "", "prenom": "", "id": 0, "data": {}, "position": "", "indoor": 0, "sensor": "", "type": "","lat":"","lon":""}, "geometry": { "type": "Point", "coordinates": [] } };
        SCfeature.properties.esp = parseInt(obj.idesp);
        SCfeature.properties.email = obj.email;
        SCfeature.properties.adresse = obj.adresse;
        SCfeature.properties.nom = obj.nom;
        SCfeature.properties.prenom = obj.prenom;
        SCfeature.geometry.coordinates[0] = result.cells.find(el => el.id.toString() == obj.idapi).longitude;
        SCfeature.geometry.coordinates[1] = result.cells.find(el => el.id.toString() == obj.idapi).latitude;
        SCfeature.properties.id = result.cells.find(el => el.id.toString() == obj.idapi).id;
        SCfeature.properties.position = obj.position;
        SCfeature.properties.indoor = result.cells.find(el => el.id.toString() == obj.idapi).indoor;
        SCfeature.properties.data = result.cells.find(el => el.id.toString() == obj.idapi).data;
        SCfeature.properties.sensor = result.cells.find(el => el.id.toString() == obj.idapi).sensor;
        SCfeature.properties.type = obj.type;
        SCfeature.properties.lat = obj.lat;
        SCfeature.properties.lon = obj.lon;
        return SCfeature;
      } else if (obj.type == "PM" || obj.type == "THP") {

        var SCfeature = { "type": "Feature", "properties": { "esp": 0, "email": "", "adresse": "", "nom": "", "prenom": "", "id": 0, "data": null, "position": "", "type": "","lat":"","lon":""}, "geometry": { "type": "Point", "coordinates": [] } };
        SCfeature.properties.esp = parseInt(obj.idesp);
        SCfeature.properties.email = obj.email;
        SCfeature.properties.adresse = obj.adresse;
        SCfeature.properties.nom = obj.nom;
        SCfeature.properties.prenom = obj.prenom;
        SCfeature.geometry.coordinates[0] = parseFloat(obj.lon);
        SCfeature.geometry.coordinates[1] = parseFloat(obj.lat);
        SCfeature.properties.id = parseInt(obj.idapi);
        SCfeature.properties.position = obj.position;
        SCfeature.properties.type = obj.type;
        SCfeature.properties.lat = obj.lat;
        SCfeature.properties.lon = obj.lon;
        return SCfeature;
      } else {
        var SCfeature = { "type": "Feature", "properties": { "esp": 0, "email": "", "adresse": "", "nom": "", "prenom": "", "id": "indisponible", "data": null, "position": "", "type": "pas enregistré","lat":"","lon":""}, "geometry": { "type": "Point", "coordinates": [] } };
        SCfeature.properties.esp = parseInt(obj.idesp);
        SCfeature.properties.email = obj.email;
        SCfeature.properties.adresse = obj.adresse;
        SCfeature.properties.nom = obj.nom;
        SCfeature.properties.prenom = obj.prenom;
        SCfeature.geometry.coordinates[0] = parseFloat(obj.lon);
        SCfeature.geometry.coordinates[1] = parseFloat(obj.lat);
        SCfeature.properties.position = obj.position;
        SCfeature.properties.type = obj.type;
        SCfeature.properties.lat = obj.lat;
        SCfeature.properties.lon = obj.lon;
        return SCfeature;
      }
    });

    SC_Values.features = mapper;
      // console.log(SC_Values.features);
      // SCSensorsMap.addData(SC_Values).bringToBack();

    if (user_selected_value == "PM10" || user_selected_value == "PM25" || user_selected_value == "PM1") {
       var dataFilter = {"type": "FeatureCollection","name": "SCSensors","crs": { "type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84" }},"features": []};
        dataFilter.features = SC_Values.features.filter(e => e.properties.type == "PM" || e.properties.type == "X");
      console.log(dataFilter.features);
      SCSensorsMap.addData(dataFilter).bringToBack();
    }
    if (user_selected_value == "Humidity" || user_selected_value == "Temperature" || user_selected_value == "Pressure") {
       var dataFilter = {"type": "FeatureCollection","name": "SCSensors","crs": { "type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84" }},"features": []};
        dataFilter.features = SC_Values.features.filter(e => e.properties.type == "THP" || e.properties.type == "X");
      console.log(dataFilter.features);
      SCSensorsMap.addData(dataFilter).bringToBack();
    }

        
d3.select("#loading_layer").style("display", "none");   
    });    
}

function setQueryString() {
	let stateObj = {};
	let new_path = window.location.pathname + "?";
	if (query.nooverlay != "false") new_path += "nooverlay&";
	if (query.selection != config.selection) new_path += "selection="+query.selection+"&";
	if (! d3.select("#cb_wind").property("checked")) new_path += "nowind&";
	if (! d3.select("#cb_labs").property("checked")) new_path += "nolabs&";
	new_path = new_path.slice(0,-1) + location.hash;
	console.log(new_path);
	history.pushState(stateObj,document.title,new_path);
}

function switchLabLayer() {
	if (d3.select("#cb_labs").property("checked")) {
		map.getPane('markerPane').style.visibility = "visible";
	} else {
		map.getPane('markerPane').style.visibility = "hidden";
	}
	setQueryString();
}

function switchWindLayer() {
	if (d3.select("#cb_wind").property("checked")) {
		d3.selectAll(".velocity-overlay").style("visibility", "visible");
	} else {
		d3.selectAll(".velocity-overlay").style("visibility", "hidden");
	}
	setQueryString();
}

function switchLegend(val) {
	d3.select('#legendcontainer').selectAll("[id^=legend_]").style("display", "none");
	d3.select('#legend_' + val).style("display", "block");
}

function reloadMap(val) {
  console.log(val);
  switchLegend(val);
  SCSensorsMap.clearLayers();
      if (val == "PM10" || val == "PM25" || val == "PM1") {
       var dataFilter = {"type": "FeatureCollection","name": "SCSensors","crs": { "type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84" }},"features": []};
        dataFilter.features = SC_Values.features.filter(e => e.properties.type == "PM" || e.properties.type == "X");
      console.log(dataFilter.features);
      SCSensorsMap.addData(dataFilter).bringToBack();
    }
    if (val == "Humidity" || val == "Temperature" || val == "Pressure") {
       var dataFilter = {"type": "FeatureCollection","name": "SCSensors","crs": { "type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84" }},"features": []};
        dataFilter.features = SC_Values.features.filter(e => e.properties.type == "THP" || e.properties.type == "X");
      console.log(dataFilter.features);
      SCSensorsMap.addData(dataFilter).bringToBack();
    }

}

function showAllSelect() {
	const custom_select = d3.select("#custom-select");
	if (custom_select.select(".select-items").empty()) {
		custom_select.append("div").attr("class", "select-items");
		custom_select.select("select").selectAll("option").each(function (d) {
			if (this.value !== user_selected_value) custom_select.select(".select-items").append("div").html("<span>"+d3.select(this).html()+"</span>").attr("id", "select-item-" + this.value).on("click", function () {
				switchTo(this);
			});
			custom_select.select("#select-item-Noise").select("span").attr("id","noise_option");
		});
		custom_select.select(".select-selected").attr("class", "select-selected select-arrow-active");
	}else{
        custom_select.select(".select-items").remove();
        custom_select.select(".select-selected").attr("class", "select-selected select-arrow-inactive"); 
    }	
}

function switchTo(element) {
	const custom_select = d3.select("#custom-select");
	custom_select.select("select").property("value", element.id.substring(12));
	custom_select.select(".select-selected").html("<span>"+custom_select.select("select").select("option:checked").html()+"</span>");
	user_selected_value = element.id.substring(12);
  custom_select.select(".select-selected").select("span").attr("id",null);
	custom_select.select(".select-selected").attr("class", "select-selected");
	reloadMap(user_selected_value);
  custom_select.select(".select-items").remove();
}

// PROMISE FILE READER

function readFile(file){
  return new Promise((resolve, reject) => {
    var psv = dsvFormat(";");
    var reader = new FileReader();
    reader.readAsText(file);
    reader.onload = function (evt) {
      var data = psv.parse(evt.target.result);
       
      data.forEach(function (o) {

        if (o.idapi != "") {
          var objet1 = { "email": "", "idesp": "", "lastname": "", "firstname": "", "address": "", "idapi": "", "lat": "", "lon": "", "location": "", "type": "PM" };
          var objet2 = { "email": "", "idesp": "", "lastname": "", "firstname": "", "address": "", "idapi": "", "lat": "", "lon": "", "location": "", "type": "THP" };

          objet1.email = o.email;
          objet1.idesp = o.idesp;
          objet1.nom = o.lastname;
          objet1.prenom = o.firstname;
          objet1.adresse = o.address;
          objet1.idapi = o.idapi;
          objet1.lat = o.lat;
          objet1.lon = o.lon;
          objet1.position = o.location;
      
          var idthp = parseInt(o.idapi) + 1

          objet2.email = o.email;
          objet2.idesp = o.idesp;
          objet2.nom = o.lastname;
          objet2.prenom = o.firstname;
          objet2.adresse = o.address;
          objet2.idapi = idthp.toString();
          objet2.lat = o.lat;
          objet2.lon = o.lon;
          objet2.position = o.location;

          respireSensors.push(objet1);
          respireSensors.push(objet2);
        } else {

          var objet3 = { "email": "", "idesp": "", "lastname": "", "firstname": "", "address": "", "idapi": "unavailable", "lat": "", "lon": "", "location": "", "type": "X" };

          objet3.email = o.email;
          objet3.idesp = o.idesp;
          objet3.nom = o.lastname;
          objet3.prenom = o.firstname;
          objet3.adresse = o.address;
          objet3.lat = o.lat;
          objet3.lon = o.lon;
          objet3.position = o.location;

          respireSensors.push(objet3);
        }
      });

      resolve(respireSensors);
    }
    reader.onerror = reject;
  });
}

function openSidebar() {
	document.getElementById("menu").innerHTML = "&#10006;";
	document.getElementById("sidebar").style.display = "block";
}

function closeSidebar() {
	document.getElementById("menu").innerHTML = "&#9776;";
	document.getElementById("sidebar").style.display = "none";
}

function toggleSidebar() {
	if (document.getElementById("sidebar").style.display === "block") {
		closeSidebar();
	} else {
		openSidebar()
	}
}
