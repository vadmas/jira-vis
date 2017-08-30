(function() { //Wrapped to protect global variables

//===================================================
//API - these functions are exposed to caller
//vis.margin
//vis.json
//vis.details     = null (Set by caller)
//vis.detailsHTML = null (Set by caller)
//
//vis.init(json,options_)
//vis.loaddata(json)
//vis.draw(display_types)
//vis.highlight(id)
//vis.clip_window
//===================================================

vis = {};

// expose margin so user can align dom elements from html
vis.margin = {top: 10, right: 30, bottom: 100, left: 60, contexttop: 10, contextbottom: 20}

// Holds the cleaned json after init
vis.json = [];
//===================================================
// -----------initialize Details pane ---------------
// ----------------(*optional*)----------------------
//===================================================
// *****Required for implementation*******
// - Div must hide/show by adding/removing a class
// called "show-details"
// - Animation is handled by css
// - Load vis.details with a jquery selection -(div/nav)
//   which contains the details panel. eg: vis.details = $("#details")
// - Load vis.detailsHTML with a function that makes html for the
//   detailspane

  vis.details = null;
  vis.detailsHTML = function(d){
  console.log("Please set a function for vis.detailsHTML which updates the details pane HTML. See vis code for example");
};
//===================================================



//===================================================
//---------------------Globals-----------------------
//===================================================

//Dimensions / Size
var margin, spacing, width, height, contextheight;
var lanePadding;   //Between 0 and 1

var gBeginTime = null, gEndTime = null;

//Tools
var gDateParser;
var gDateDisplayer;
var gPressTimer;

//Data
var gTypes = [];
var gTypesdict = {}; //Contains the number of sublanes in type T
var gJson = [];
var gVisibleItems = [];

//Global variables
var gHighlightID = "";
var gOptions  = {};
var gColorMap = {};


var COLOURS  = ["#1f77b4", "#aec7e8", "#ff7f0e", "#ffbb78", "#2ca02c", "#98df8a", "#d62728", "#ff9896", "#9467bd", "#c5b0d5", "#8c564b", "#c49c94", "#e377c2", "#f7b6d2", "#7f7f7f", "#c7c7c7", "#bcbd22", "#dbdb8d", "#17becf", "#9edae5"]

//==============end of global declaration===========


//===================================================
//-------------------Initialization------------------
//===================================================

vis.init = function(json,options_) {
  //----------------------------
  //Make objects and global vars
  //----------------------------
  gOptions = options_;


  margin        = vis.margin
  spacing       = gOptions.spacing || 50;

  width            = (gOptions.width          || 1100) - margin.left - margin.right;
  height           = (gOptions.height         || 500)  - margin.top  - margin.bottom;
  contextheight    = (gOptions.contextheight  || 120)  - margin.contexttop - margin.contextbottom;

  // Set default colours if not set by user
  if(!gOptions.colours || gOptions.colours.length === 0 ) gOptions.colours = COLOURS;

  // Map colors to types
  gOptions["types"].forEach(function(d,i){
    gColorMap[d] = gOptions.colours[i % gOptions.colours.length]
  });

  d3.select("#timeline").append("div").attr("class", "tooltip hidden");

  if(gOptions["tooltip"].length === 0){
    d3.select(".tooltip").attr("class", "OFF");
  }

  lanePadding   = gOptions.padding || 0.35;

  gDateParser    = d3.time.format("%Y-%m-%d %H:%M:%S").parse;
  gDatePrinter   = d3.time.format("%b %d, %Y");

  gDateDisplayer = d3.time.format("%c");

  //Save the full raw dataset
  gJson = json;


    //Configure details pane if set
  if(vis.details){
      vis.details.click(function(){
        // Allow the user to select text without closing pane
        var sel = getSelection().toString();
        if(!sel) $(this).toggleClass("show-details");});
    }

  vis.loaddata(json);
};
//==============end of initialization================


//===================================================
//--------------------Load data----------------------
//===================================================
vis.loaddata = function(json) {
  // Reset highlight
  vis.highlight();

  if ($.isEmptyObject(json) ) {json = gJson}
  // if (!json || json === [] ) {json = gJson}
  //-----------------------------------------------------------------------------
  //Scrub data of duplicates, make date objects, calculate sublanes for each type
  //-----------------------------------------------------------------------------
  var uniqueJSON = [];
  var uniqueTypes = [];

  json.forEach(function(d){

    if(typeof d.startdate === "string") set_dates(d);

    // Reset truncated title to empty
    d.truncated_title = "";

    // Need to check that startdate is before enddate - if not, flip start and end dates
    if (d.enddate < d.startdate){
        var tempd = d.enddate;
        d.enddate = d.startdate;
        d.startdate = tempd;
    }
    // Check for start enddate equality
    else if (d.enddate.getTime() === d.startdate.getTime()){
      d.enddate = d3.time.second.offset(d.enddate, 1);
    }

   //Will add to uniqueJSON if:
   //1) not already present
   //2) Lane of d not included in user-given list of lanes

   if(uniqueJSON.indexOf(d) == -1 && d.lane != -1) {
      uniqueJSON.push(d);
      if(uniqueTypes.indexOf(d.type) == -1) {
        uniqueTypes.push(d.type);
      }
    }
  });

   // If user doesn't provide a list of types, use all
   gTypes = gOptions["types"] || uniqueTypes;

   calculate_sublanes(uniqueJSON,gTypes);

    //Get total lanes for gTypes
    totalLanes = 0 ;
    gTypes.forEach(function(t){
      totalLanes += gTypesdict[t];
    });

    //Save the scrubbed viewing dataset
    vis.json = json;
    vis.detailsHTML(vis.json[0]);
    vis.draw(gTypes);
  };
  //==============end of loaddata================


//===================================================
//------------------Draw timeline--------------------
//===================================================
vis.draw = function(display_types) {

    var returned_types =[];
    var data;

    // filter datapoints that have a type selected by user
    data = vis.json.filter( function(d){
      // Reset truncated title to empty
      d.truncated_title = "";
      if (display_types.indexOf(d.type) != -1) { return d;}}
    );

    //No data returned (eg. user selects type which has no entries), alert and do nothing.
    if(data === 0) {
      alert("No data selected");
      return;
    }


    // -------------------------------------------------------
    // -----------------Lane calculations---------------------
    // -------------------------------------------------------
    var totalLanes = 0;
    display_types.forEach(function(t){ totalLanes += gTypesdict[t];});
    var minibarHeight = (contextheight / totalLanes) * (1 - lanePadding);

    // The lane index holds the starting place for each type
    // This is calculated as the sum of all sublanes in predecessor types.
    // Please see readme/technical/timeline.md for more details

    var laneindex = [];
    var sum = 0;
    display_types.forEach(function(d){
      laneindex.push(sum);
      sum += gTypesdict[d];
    });

    //Function that returns the correct lane number for datum d
    var lane = function(d){
      return (laneindex[display_types.indexOf(d.type)] + d.sublane);
    };
    // ------------End of lane calculations--------------


    //---------------------------------------------------
    //----------Initialize the canvas elements-----------
    //---------------------------------------------------

    //main timeline html element
    d3.select("#chart").style('position', 'relative');
    d3.select("#chart").selectAll("*").remove();

    // svg element on which everything will be drawn
    var svg = d3.select("#chart").append("svg")
        .attr("font", '10px sans-serif')
        .attr("width", width + margin.left + margin.right)
        .attr("height", (height + contextheight + margin.top + margin.bottom + margin.contexttop + margin.contextbottom + spacing));

    // Hovering tooltip
    var tooltip = d3.select(".tooltip");

    // Holds defs like clippath and arrowheads
    var defs = svg.append("defs");
          defs.append("clipPath")
              .attr("id", "mainclip")
            .append("rect")
              .attr("width", width)
              .attr("height", height)
          defs.append("clipPath")
              .attr("id", "miniclip")
            .append("rect")
              .attr("width", width)
              .attr("height", contextheight);

    // Configure Arrowheads
    // For more info: https://gist.github.com/satomacoto/3384995
    defs.append("svg:marker")
        .attr("class", "arrowHead")
        .attr("id", "arrow")
        .attr("viewBox","0 0 10 10")
        .attr("refX","8.2")
        .attr("refY","5")
        .attr("markerUnits","strokeWidth")
        .attr("markerWidth","9")
        .attr("markerHeight","5")
        .attr("orient","auto")
      .append("svg:path")
       .attr("d","M 0 0 L 10 5 L 0 10 z");

    // Circle for endpoint
    defs.append("svg:marker")
      .attr({
          id: 'circle',
          markerWidth: 8,
          markerHeight: 8,
          refX: 5,
          refY: 5
      })
      .append('circle')
        .attr({
          cx: 5,
          cy: 5,
          r: 1.2,
          'class': 'circleMarker'
        });

    //Main timeline
    var main = svg.append("g")
        .attr("class", "main")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .attr("width", width)
        .attr("height", height);

    //Mini timeline
    var mini = svg.append("g")
        .attr("class", "mini")
        .attr("transform", "translate(" + margin.left + "," + (height + margin.top + spacing) + ")")
        .attr("width", width)
        .attr("height", contextheight);

    // -------------------------
    // Set up scales + axis
    // -------------------------
    var xmin = d3.min(data,function(d){return d.startdate});
    var xmax = d3.max(data,function(d){return d.enddate});

    //Time scales

    x  = d3.time.scale().range([0, width]).domain([xmin, xmax]),
    y  = d3.scale.linear().range([ 0, height]).domain([0, totalLanes]),

    x2 = d3.time.scale().range([0, width]).domain([xmin, xmax]),
    y2 = d3.scale.linear().range([ 0, contextheight]).domain([0, totalLanes]);


    //Axes (Axises?)
    var xAxisMain = d3.svg.axis().scale(x).orient("bottom").tickSize(-height);
        xAxisMini = d3.svg.axis().scale(x2).orient("bottom"); //Min graph axis is fixed, main changes depending on selection
        yAxisMain = d3.svg.axis().scale(y).orient("left");
        yAxisMini = d3.svg.axis().scale(y2).orient("left");

    // This determines what is displayed on the time axis (months, years, etc)
    var customTimeFormat = d3.time.format.multi([
      [".%L",   function(d) { return d.getMilliseconds(); }],
      [":%S",   function(d) { return d.getSeconds(); }],
      ["%I:%M", function(d) { return d.getMinutes(); }],
      ["%I %p", function(d) { return d.getHours(); }],
      ["%a %d", function(d) { return d.getDay() && d.getDate() != 1; }],
      ["%b %d", function(d) { return d.getDate() != 1; }],
      ["%b",    function(d) { return d.getMonth(); }],
      ["%Y",    function() { return true; }]
    ]);

    xAxisMain.tickFormat(customTimeFormat);
    xAxisMini.tickFormat(customTimeFormat);

    //Zoom
    var zoom = d3.behavior.zoom()
      .x(x).y(y)
      .scaleExtent([1, 100])
      .on("zoom", zoomed);

    //Line maker
    //Pass array of x,y points to draw polyline
    var line = d3.svg.line()
          .x(function(d) { return d.x; })
          .y(function(d) { return d.y; })
          .interpolate("linear");

    //-------End of canvas elements initialization-------


    //---------------------------------------------------
    //----------Assemble the canvas elements-----------
    //---------------------------------------------------

     // Attach xAxisMain to main
    main.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxisMain);

    // Attach xAxisMini to main
    mini.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + (contextheight) + ")")
        .call(xAxisMini);

    // Make translucent zoom area so user can zoom on
    // entire chart
    var zoomarea = main.append("rect")
        .attr("id"    , "zoomspace")
        .attr("style" , "opacity:0")
        .attr("width" , width)
        .attr("height", height)
        .call(zoom)
        .on("mousemove.focal",function(d){ zoom.center(d3.mouse(this));
        });

    // Make group to hold rectangles
    var itemRects = main.append("g")
        .attr('id', "rectspace")
        .attr("clip-path", "url(#mainclip)");

    //Groups allow us to order the paths, rects, and labels
    //path group underneath
    var pathGroup   = itemRects.append("g")
        .attr('id', "paths");
    //then circleg group underneath
    var circleGroup= itemRects.append("g")
        .attr('id', "circles");
    //then finally bars on top
    var barGroup   = itemRects.append("g")
        .attr('id', "bars");
    // Rectangles for mini timeline
    var miniRects = mini.append("g")
        .attr('id', "minirectspace")
        .attr("clip-path", "url(#miniclip)");

    miniRects.selectAll("miniItems")
        .data(data)
       .enter().append("rect")
        .attr("class" ,function(d) {return "minibar " + "bar" + (gTypes.indexOf(d.type)%8);})
        .attr("id" ,   function(d) {return "mini" + d.id;})
        .attr("x"     ,function(d) {return x(d.startdate);})
        .attr("y"     ,function(d) {return y2(lane(d));})
        .attr("width" ,function(d) {return x(d.enddate) - x(d.startdate);})
        .attr("height",(minibarHeight))
        .style("fill", function(d) {return gColorMap[d.type]; });


    //======================================================
    //----------------------Make brush----------------------
    //======================================================
    // The zoom function will move the brush, and the brush
    // function will redraw the bars
    //======================================================


    var brush = d3.svg.brush()
      .x(x2)
      .y(y2)
      .on("brush", brushed);

    var brushNode = mini.append("g")
          .attr("class", "brush")
          .call(brush);


      brushed();

    //======================================================
    //------------------Handle brush------------------------
    //======================================================
    // Brushed function is called when user moves brush or
    // when zoom function calls brush function. This function
    // handles the drawing/updating the bars.
    //=======================================================

      function brushed() {

            //------------------------------------------------------
            //-----------Grab data within brush window--------------
            //------------------------------------------------------

            var e = brush.extent(),
                xextent = [e[0][0], e[1][0]],
                yextent = [e[0][1], e[1][1]];

            x.domain(brush.empty() ? x2.domain() : xextent);
            y.domain(brush.empty() ? y2.domain() : yextent);

            main.select(".x.axis").call(xAxisMain);
            main.select(".y.axis").call(yAxisMain);

            var rects, labels, paths;

            var minXExtent = x.domain()[0];
            var maxXExtent = x.domain()[1];
            var minYExtent = y.domain()[0];
            var maxYExtent = y.domain()[1];

            //Grab only items in brush window
            gVisibleItems = data.filter(function(d) {
                  return d.startdate < maxXExtent &&
                         d.enddate > minXExtent &&
                         lane(d) <= maxYExtent &&
                         lane(d) >= Math.floor(minYExtent);
              });

            //------------------end of filter data------------------

            mini.select(".brush").call(brush.extent(e));

            // Calculate font size and average charsize (used to truncate title)
            // for particular zoom scale
            var barHeight          = y(1 - lanePadding) - y(0);
            var fontSize           = d3.min([barHeight/1.2, 20]);
            var average_char_width = calculateAverageCharSize(fontSize)

            //======================================================
            //------------------Make main bars----------------------
            //======================================================
            // Here we follow the standard enter-update-exit pattern
            // discussed here: http://bost.ocks.org/mike/circles/
            //
            // One bar is made for each element in the gVisibleItems array
            // Each bar is a group consisting of a rect and some text
            // We also add click handlers to each g to handle
            // highlight, details pane, and tooltip
            //======================================================

            //Update existing bars
            var bars = barGroup.selectAll("g")
                 .data(gVisibleItems, function(d) {return d.id;})
                 .attr("transform", function(d){ return "translate("+ x(d.startdate) +"," + y(lane(d)) + ")";} )
                 .each(function(d) {
                    var bar = d3.select(this);
                    var barWidth = x(d.enddate) - x(d.startdate);
                    var textWidth = d.truncated_title.length * average_char_width

                    if(textWidth >= barWidth || textWidth <= barWidth*0.95){
                      d.truncated_title = calculateDisplayTitle(d.title, average_char_width, barWidth)
                    }

                    bar.select("rect")
                      .attr("width" , barWidth)
                      .attr("height", function() {return barHeight;});
                    bar.select("text")
                      .attr("x", 3)
                      .attr("y", fontSize)
                      .attr("font-size"  , fontSize + "px")
                      .text(d.truncated_title);
                  });
            //Add new bars
                 bars.enter().append("g")
                   .attr("class" ,    function(d) {return "bar" + (gTypes.indexOf(d.type)%8);})
                   .attr("id"    ,    function(d) {return d.id;})
                   .attr("transform", function(d) {return "translate("+ x(d.startdate) +"," + y(lane(d)) + ")";} )
                   .attr("width" ,    function(d) {return x(d.enddate) - x(d.startdate);})
                   .attr("height",    function(d) {return barHeight;})
                   .style("fill", function(d) {return gColorMap[d.type]; })
                   .each(function(d) {
                      //text ratio compared to barheight
                      var bar = d3.select(this);
                      var barWidth  = x(d.enddate) - x(d.startdate);

                      // Only do this once
                      if (d.truncated_title === ""){
                        d.truncated_title = calculateDisplayTitle(d.title, average_char_width, barWidth)
                      }

                      bar.append("rect")
                        .attr("width" , barWidth)
                        .attr("height", barHeight)
                        .attr("id"    ,function(d) {return d.id;})
                        .classed("whiteout", function(d){
                          if(gHighlightID === "" || gHighlightID === d.id) return false;
                          else return true;
                        });
                      bar.append("text")
                        .attr("font-size"  , fontSize + "px")
                        .attr("text-anchor", "start")
                        .attr('fill', "white")
                        .attr("x", 3)
                        .attr("y", fontSize)
                        .text(d.truncated_title);
                      });

                  //Add functionality for bars
                  bars.call(zoom).on("dblclick.zoom", null)
                    .on("mousemove.focal",function(d){

                      //This resets the zoom focal point to be relative to the zoom area again
                      var mouse = d3.mouse(this);
                      var t = d3.transform(d3.select(this).attr("transform")),
                          x = t.translate[0],
                          y = t.translate[1];
                      var focal = [mouse[0]+x, mouse[1]+y];
                      zoom.center(focal);

                      // Show tooltip
                      tooltip.classed("hidden", false)
                        .attr("style", "left:"+(d3.event.pageX + 15 )+"px;top:"+(d3.event.pageY - 20)+"px")
                        .html(makeHTML(d));

                    })
                      // Hide tooltip
                    .on("mouseout.tooltip",  function(d) {
                      tooltip.classed("hidden", true);
                    })
                    // .on("click"          , handleClick())
                    .on("click"          , function(d){ vis.highlight(d)})
                    .on("mouseover.line" , showLine())
                    .on("mouseout.line"  , hideLine());

                  bars.exit().remove();

            //---------------End of make main bars------------------

            //======================================================
            //--------------Make links connecting bars--------------
            //======================================================
            // Again we follow the standard enter-update-exit pattern
            // discussed here: http://bost.ocks.org/mike/circles/
            //
            // We make a new dataset consisting of pathdata, where
            // each datapoint in pathdata looks like this:
            // datapoint = {"startY"   : startY,
            //              "endY"     : endY,
            //              "time"     : d.time,
            //              "fromNode" : fromNode,
            //              "toNode"   : toNode,
            //              "id"       : id
            //              }
            // The pathdata comes from getPathData(). We also add
            // small red circles to indicate where on the bar the
            // path is originating from
            //======================================================
             var pathData = getPathData();

                   paths = pathGroup.selectAll("path")
                        .data(pathData, function(d) { return d.id; })
                        .attr("stroke-width", d3.min([barHeight/6,5]))
                        .attr('d', makeline());
                       paths.enter().append("path")
                        .attr('class', function(d) { return "parentline from" + d.fromNode.id + " to" + d.toNode.id;} )
                        .attr('d', makeline())
                        .attr("stroke-width", d3.min([barHeight/6,5])) //Arrows can grow to max of 5 pixels
                        .attr("marker-start", "url(#circle)")
                        .attr("marker-end", "url(#arrow)")
                        .call(zoom)
                        .on("click" , function(d){ vis.highlight(d.fromNode)})
                        .on("mousemove", function(d){
                          tooltip.classed("hidden", false)
                            .attr("style", "left:"+(d3.event.pageX + 15 )+"px;top:"+(d3.event.pageY - 20)+"px")
                          .html(gDateDisplayer(d.time));
                        })
                        .on("mouseout",function(d) {
                          tooltip.classed("hidden", true);
                        });

                   paths.exit().remove();

                   circles = circleGroup.selectAll("circle")
                        .data(pathData, function(d) { return d.id; })
                          .attr('cx', function(d) {return x(d.time);})
                          .attr('cy', function(d) {return d.startY;})
                          .attr('r',  function(d) {return d3.min([barHeight/20,2]);});
                        circles.enter().append('circle')
                          .attr('class', function(d) {return "innercircle from" + d.fromNode.id;} )
                          .attr('cx', function(d) {return x(d.time);})
                          .attr('cy', function(d) {return d.startY;})
                          .attr('r',  function(d) {return d3.min([barHeight/20,2]);});
                        circles.exit().remove();

              //-----------End of make paths------------------------

              //------------------------------------------------------
              //-----------------Helper functions---------------------
              //------------------------------------------------------

              function calculateDisplayTitle(text,charwidth,barWidth){

                var textWidth = Math.ceil(text.length * charwidth);
                var display_title = "";

                if(textWidth < barWidth){ display_title = text;}

                else{
                  display_title = text.substring(0,(barWidth/charwidth - 2)) //Space for "..."
                  if(display_title.length > 0) display_title += "..."
                }
                return display_title;
              }

              function getPathData(){

                var pathData = [];
                  data.forEach(function (d) {
                    d.link.forEach(function(dd) {
                        //Time not valid, skip over link entry
                        if(typeof dd.time === "undefined") return;

                        var fromNode = getEntryById(data, d.id);
                        var toNode   = getEntryById(data, dd.target);

                        //Id not valid, skip over link entry
                        if (typeof fromNode === "undefined" || typeof toNode === "undefined") return;

                        var startY = y(lane(fromNode));
                        var endY   = y(lane(toNode));

                        if(startY < endY) startY += barHeight; //Arrow points downwards, therefore start at bottom of bar
                        else endY += barHeight //Arrow points up, therefore end at bottom of bar

                        var entry = {
                          "startY":startY,
                          "endY":endY,
                          "time":dd.time,
                          "fromNode":fromNode,
                          "toNode":toNode,
                          "id"    :fromNode.id + "_" + toNode.id
                        };
                       pathData.push(entry);

                    });
                 });

                return pathData;
              }

              function makeline(){
                return function(d){
                    var coordinates = [{"x": x(d.time), "y": d.startY},
                                       {"x": x(d.time), "y": d.endY  }];
                    return line(coordinates);
                   };
                }

              function makeHTML(d){
                   // Hardcoded for now
                    var html = ""
                    if($.inArray("title",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "Title" + "</strong>: " + d.title + "<br>";
                    }
                    if($.inArray("id",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "Id" + "</strong>: " + d.id + "<br>";
                    }
                    if($.inArray("type",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "Type" + "</strong>: " + d.type + "<br>";
                    }
                    if($.inArray("startdate",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "Start Date" + "</strong>: " + d.startdate + "<br>";
                    }
                    if($.inArray("enddate",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "End Date" + "</strong>: " + d.enddate + "<br>";
                    }
                    if($.inArray("description",gOptions["tooltip"]) != -1 ){
                        html += "<strong>" + "Description" + "</strong>: " + d.description + "<br>";
                    }
                  return html;
            }
        //----------------End of helper functions-------------------
    }
    //----------------End Brush function-----------------------


    //======================================================
    //---------------------Handle zoom----------------------
    //======================================================
    // Zoomed function is called when user zooms in or out.
    // Zoom adjusts the brush and calls brush function,
    // where the updates happens.
    //=======================================================

       function zoomed() {

          //Turn off zoom update because user isn't using brush
          brush.on("brushend",null)

          var t = zoom.translate();
          var s = zoom.scale();

          //prevent translation/zoom from exceeding bounds
          tx = Math.min(0, Math.max(width * (1 - s), t[0]));
          ty = Math.min(0, Math.max(height * (1 - s), t[1]));

          zoom.translate([tx, ty]);

          main.select(".x.axis").call(xAxisMain);
          main.select(".y.axis").call(yAxisMain);

          //update brush and redraw
          var x0 = x.domain()[0],
              y0 = y.domain()[0],

              x1 = x.domain()[1],
              y1 = y.domain()[1];

          // Remove brush when fully open
          var fullextent = x2.domain();
          if ((x0 <= fullextent[0]) && (x1 >= fullextent[1])) {
            brush.clear();
          }
          else{
            brush.extent([[x0,y0],[x1,y1]]);
          }
          brush.event(d3.select(".brush"));
          brush(d3.select(".brush"));

          //------------------------------------------------------
          // When user lets go of brush, zoom translate should update
          //------------------------------------------------------

          brush.on("brushend",function(){

            // Calculate new scale
            var fullwidth = x2.range()[1];
            var brushwidth = x2(x.domain()[1]) - x2(x.domain()[0])
            var scale = fullwidth/brushwidth;


            // Calculate new translation

            //This returns the x/y midpoint of the brush wrt the context
            var xchange = (x2(brush.extent()[0][0]) + x2(brush.extent()[1][0]))/2
            var ychange = (y2(brush.extent()[0][1]) + y2(brush.extent()[1][1]))/2

            // Scale the change and compare to the midpoint of the svg canvas (width/2)
            var tx = (width/2 - scale * xchange)
            var ty = (height / contextheight) * (contextheight/2 - scale * ychange )

            // Update the zoom scale and translation
            //-------------------------------------------
            zoom.translate([tx,ty]);
            zoom.scale(scale);

          })
       }

       function update_zoom(){

            // Calculate new scale
            var fullwidth = x2.range()[1];
            var brushwidth = x2(x.domain()[1]) - x2(x.domain()[0])
            var scale = fullwidth/brushwidth;


            // Calculate new translation

            //This returns the x/y midpoint of the brush wrt the context
            var xchange = (x2(brush.extent()[0][0]) + x2(brush.extent()[1][0]))/2
            var ychange = (y2(brush.extent()[0][1]) + y2(brush.extent()[1][1]))/2

            // Scale the change and compare to the midpoint of the svg canvas (width/2)
            var tx = (width/2 - scale * xchange)
            var ty = (height / contextheight) * (contextheight/2 - scale * ychange )

            // Update the zoom scale and translation
            //-------------------------------------------
            zoom.translate([tx,ty]);
            zoom.scale(scale);

       }
  //----------------End of zoom-------------------
};
//----------------End of vis.draw-------------------

vis.highlight = function(entry){

  var d = entry || gHighlightID;

  if (typeof d === "string") d = getEntryById(vis.json, d);

  if (typeof d === "undefined") return // Incorrect id
  //-------------------
  //Handle highlighing
  //-------------------
    if(gHighlightID === "" ){

      //Grab all bars but selected one
      var mainBars = d3.selectAll("#bars rect, .minibar").filter(function(bar){return bar.id != d.id ;});
      mainBars.transition().duration(100).style('opacity', 0.3);
      d3.select("#" + d.id).on("mouseout",null);

      // Select all incoming and outgoing arrows
      d3.selectAll(".from" + d.id + ", .to" + d.id).style("opacity", 1).classed("opaque", true);
      gHighlightID = d.id;

      //Handle details
      if(vis.details){
        vis.detailsHTML(d);
        vis.details.addClass("show-details");
      }

    }
    else if (gHighlightID != d.id) {

      //Switch opacity of previously highlighted and selected
      d3.selectAll("#" + d.id + " rect, #mini" + d.id ).style('opacity', 1).classed("whiteout",false);
      d3.selectAll("#" + gHighlightID + " rect, #mini" + gHighlightID ).style('opacity', 0.3);

      d3.select("#" + d.id).on("mouseout",null);
      d3.select("#" + gHighlightID).on("mouseout",hideLine());

      d3.selectAll(".from" + d.id + ", .to" + d.id).style("opacity", 1).classed("opaque", true);
      d3.selectAll(".from" + gHighlightID + ", .to" + gHighlightID).style("opacity", 0.25).classed("opaque", false);

      gHighlightID = d.id;

      //Handle details
      if(vis.details){
        vis.detailsHTML(d);
        vis.details.addClass("show-details");
      }
    }

    else{
      //return opacity
      var all = d3.selectAll("#bars rect, .minibar").classed("whiteout",false);
      all.transition().duration(100).style('opacity', 1);

      d3.select("#" + gHighlightID).on("mouseout",hideLine());
      d3.selectAll(".from" + d.id + ", .to" + d.id).style("opacity", 0.25).classed("opaque", false);
      gHighlightID = "";

      //Handle details
      if(vis.details){
        vis.details.removeClass("show-details");
      }

    }

  //-------------------
  //Handle search bar
  //-------------------

    $('#highlight_search').val(d.id)

  }


  vis.clip_window = function(){
      vis.loaddata(gVisibleItems)
  }


//===================================================
//-----------------Helper functions------------------
//===================================================


function showLine(){
  return function(d){
    if(gHighlightID === "" || gHighlightID === d.id){
      d3.selectAll(".from" + d.id + ", .to" + d.id)
          .transition().duration(75)
          .style('opacity',1);
       }
      };
  }

function hideLine(){
  return function(d){
    if(gHighlightID === "" || gHighlightID != d.id){
      d3.selectAll(".from" + d.id + ":not(.opaque), .to" + d.id +":not(.opaque)")
        .transition().duration(75)
        .style('opacity',0.25);
    }
  };
}


function calculate_sublanes(data, types){

  // var index = 0;
  var sublanes;
  types.forEach(function(type){
      //filtered is set containing only data of type T
      var filtered = data.filter(function(d){ if( d.type === type) return d;});

        //sortSublanes() function adds the sublane field to each type and returns the number of sublanes in a lane
      sublanes = sortSubLanes(filtered);
      gTypesdict[type] = sublanes

        //We need this to keep track of where each lane begins
        // index += sublanes;
    });

  //----------------------------------------------------------
  // sortSubLanes sorts an array of entries into sublanes, such that no entry has an overlaping
  // start/stop time. Algorithm adopted from slide 16 here:
  // http://people.cs.umass.edu/~sheldon/teaching/mhc/cs312/2013sp/Slides/Slides08%20-%20IntervalScheduling.pdf
  // @return: The number of sublanes
  // ----------------------------------------------------------
  function sortSubLanes(unfiltered){
      unfiltered.sort(function(a,b){
        if (a.startdate < b.startdate) {return -1;}
        if (a.startdate > b.startdate) {return  1;}
        return 0;
      });

      var laneCount = 0;
      var filtered = [];
      unfiltered.forEach(function(d){
        d.sublane = -1;
        //check if d is compatible with some lane i <= laneCount
        //if so, add it to lane i. If not, increase lane count and continue

        for(var i = 0; i <=laneCount; i++){
            var laneOccupants = filtered.filter(function(d){ if(d.sublane === i) return d;});

            if(isCompatibile(d,laneOccupants)) {
              d.sublane = i;
              filtered.push(d);
              break;
            }
          }
          //Sublane hasn't been assigned, therefore increase lanecount
          if( d.sublane === -1) {
            d.sublane = ++laneCount;
            filtered.push(d);
          }
        });
        //This will be used to calculate the index of each lane. +1 to account for 0 index.
        return (laneCount + 1);
    }

  // ----------------------------------------------------------
  // isCompatible checks a sublane to see if a new entry (newbie) can be slotted
  // into the sublane without overlapping any existing entries
  // ----------------------------------------------------------

  function isCompatibile(newbie, occupants){
    if(occupants.length ===0) return true;
    //check incompatibility for each occupant in the lane
    for (var i = 0; i < occupants.length; i++) {
        if((newbie.startdate >= occupants[i].startdate && newbie.startdate < occupants[i].enddate) ||
         (newbie.enddate < occupants[i].enddate && newbie.enddate >= occupants[i].startdate)) {
           return false;
        }
    }
    //No conflicts
    return true;
  }
}
//------------end of calculate sublanes------------

function set_dates(d){

    d.startdate = gDateParser(d.startdate.split(".")[0]);
    d.enddate   = gDateParser(d.enddate.split(".")[0]);
    d.link.forEach(function(link) {
      if(typeof link.time != "undefined") {
        link.time = gDateParser(link.time);
      }
    });
};

  function getEntryById(data, id) {
      var filter = data.filter(function(d) {return d.id === id;});
      if(filter.length === 1) return filter[0];
      else return undefined;
};

  function calculateTextWidth(bar, fontsize, text){
   var t = bar.append("text")
            .attr("id","tempText")
            .attr("font-size"  , fontsize + "px")
            .attr("text-anchor", "start")
            .attr('opacity', "0")
            .attr("x", 3)
            .attr("y", fontsize)
            .text(text);
   var width = t.node().getBBox().width;
   t.remove();

   return width;
  }

  // This function calculates the average px width of a character for a given font
  // by finding the width of the bounding box for the whole charset and dividing by the length
  function calculateAverageCharSize(fontsize){
   var charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .!@#$%^&*()"
   var t = d3.select("#chart svg").append("text")
            .attr("id","tempText")
            .attr("font-size"  , fontsize + "px")
            .attr("text-anchor", "start")
            .attr('opacity', "0")
            .attr("x", 3)
            .attr("y", fontsize)
            .text(charset);
   var width = t.node().getBBox().width;
   t.remove();
   return width / charset.length

  }

})();
