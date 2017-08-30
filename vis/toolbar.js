$(document).ready(function() {


// =======================================================//
// =================Initialize Jira toolbar===============//
// =======================================================//

    //Configure multiselect widget
    var ob = $('#type_select');

    // Types come from timeline.js
    TYPES.forEach(function(d){
        ob.append("<option class='typeList' selected='selected' value='"+d+"'>"+d+"</option>");
    });

    ob.multiselect({
        // includeSelectAllOption: true,
        allSelectedText: 'Display all Types',
        onDropdownHide: function(event) {
            var selected = ob.val();
            if (!selected ){
                $('#type_select option').prop("selected",true)
                ob.multiselect("rebuild")
            }
            var selected = $(".multiselect-container input:checked")
            var types = [];
            $(selected).each(function(index, brand){
                types.push($(this).val());
            });
            vis.draw(types);
        }
    });
    $(".multiselect-all").attr("id","selectAll")
    $(".multiselect-container").attr("id","my-ui-list")

  // var list = document.getElementById("my-ui-list");
  var list = document.getElementById("my-ui-list");
  Sortable.create(list); // That's all.

  $("#lookupform").submit(function (e) {
      e.preventDefault(); // this will prevent button from submitting the form.
      console.log("click");
      $("#submit").click();
  });

  function formerror(msg){
     $("#form-alert").show();
     $(document).trigger("set-alert-id-example", [
        {
        message: msg,
        priority: "error"
        }
    ]);
  }

  $("#highlight_submit").click(handleHighlight);
  $("#query_submit").click(handleKeyword);

  $('#dropdown_highlight').click(function(e){
    e.preventDefault();
    $("#highlight_submit").text("Highlight");
    $("#highlight_submit").off('click').on('click',handleHighlight)
   });

  $('#dropdown_focus').click(function(e){
    e.preventDefault();
    $("#highlight_submit").text("Focus");
    $("#highlight_submit").off('click').on('click',handleFocus)
  });

  $('#dropdown_keyword').click(function(e){
    e.preventDefault();
    $("#query_submit").text("Keyword");
    $("#query_submit").off('click').on('click', handleKeyword)
  });

  $('#highlight_dropdown_reset').click(function(e){
    e.preventDefault();
    handleReset();
  });

  $('#highlight_dropdown_clip_window').click(function(e){
    e.preventDefault();
    vis.clip_window();
  });

  $('#query_dropdown_reset').click(function(e){
    e.preventDefault();
    handleReset();
  });

  $('#query_dropdown_clip_window').click(function(e){
    e.preventDefault();
    vis.clip_window();
  });

function handleReset(){
    $("#highlight_search").val("")
    $("#query_search").val("")
    $("#form-alert").hide();
    vis.highlight();
    vis.loaddata(DATA);
    $('#type_select option').prop("selected",true)
    ob.multiselect("refresh")
}

function handleHighlight(){
    var search = $("#highlight_search").val()
    $("#form-alert").hide();
    if(search){
        if(jscanner.contains(search)){
            vis.highlight(search)
        }
        else{
            formerror("Dataset does not contain ID: '" + search + "'.")
        }
    }
 };

function handleKeyword(){
    var search = $("#query_search").val()
    $("#form-alert").hide();
    if(search){
        var json_keyword = jscanner.by_keyword(search);
        if($.isEmptyObject(json_keyword)){
            formerror("Dataset does not contain Keyword: '"+search+"'.")
        }
        else{
            var types = ob.val();
            vis.loaddata(json_keyword,types);
        }
    }
}

function handleFocus(){
    var search = $("#highlight_search").val()
    $("#form-alert").hide();
    if(search){
        if(jscanner.contains(search)){
            var json_parent_children = jscanner.by_id(search);
            var types = ob.val();
            vis.loaddata(json_parent_children,types);
         }
        else{
            formerror("Dataset does not contain ID: '"+search+"'.")
         }
    }
}

});
