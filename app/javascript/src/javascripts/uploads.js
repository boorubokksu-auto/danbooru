import Dropzone from 'dropzone';
import SparkMD5 from 'spark-md5';

let Upload = {};

Upload.IQDB_LIMIT = 5;
Upload.IQDB_MIN_SIMILARITY = 50;
Upload.IQDB_HIGH_SIMILARITY = 70;

Upload.initialize_all = function() {
  if ($("#c-uploads").length) {
    this.initialize_image();
    this.initialize_similar();
    this.initialize_submit();
    $("#similar-button").click();

    $("#toggle-artist-commentary").on("click.danbooru", function(e) {
      Upload.toggle_commentary();
      e.preventDefault();
    });

    $("#toggle-commentary-translation").on("click.danbooru", function(e) {
      Upload.toggle_translation();
      e.preventDefault();
    });

    $(document).on("click.danbooru", "#c-uploads #a-batch #link", Upload.batch_open_all);
  }

  if ($("#c-uploads #a-new").length) {
    this.initialize_dropzone();
  }
}

Upload.initialize_submit = function() {
  $("#form").on("submit.danbooru", Upload.validate_upload);
}

Upload.validate_upload = function (e) {
  var error_messages = [];
  if (($("#upload_file").val() === undefined) && !/^https?:\/\/.+/i.test($("#upload_source").val()) && $("#upload_md5_confirmation").val() === "") {
    error_messages.push("Must choose file or specify source");
  } else if ($(".dz-progress:visible").length) {
    error_messages.push("File has not finished uploading yet")
  }
  if (!$("#upload_rating_s").prop("checked") && !$("#upload_rating_q").prop("checked") && !$("#upload_rating_e").prop("checked") &&
      ($("#upload_tag_string").val().search(/\brating:[sqe]/i) < 0)) {
    error_messages.push("Must specify a rating");
  }
  if (error_messages.length === 0) {
    $("#submit-button").prop("disabled", "true");
    $("#submit-button").prop("value", "Submitting...");
    $("#client-errors").hide();
  } else {
    $("#client-errors").html("<strong>Error</strong>: " + error_messages.join(", "));
    $("#client-errors").show();
    e.preventDefault();
  }
}

Upload.initialize_similar = function() {
  $("#similar-button").on("click.danbooru", function(e) {
    e.preventDefault();

    let source = $("#upload_source").val();
    if (/^https?:\/\//.test(source)) {
      $.get("/iqdb_queries.js", {
        limit: Upload.IQDB_LIMIT,
        search: {
          url: source,
          similarity: Upload.IQDB_MIN_SIMILARITY,
          high_similarity: Upload.IQDB_HIGH_SIMILARITY
        }
      });
    }
  });
}

Upload.initialize_image = function() {
  let $image = $("#image");

  if ($image.prop("complete")) {
    Upload.update_scale();
  } else {
    $image.on("load.danbooru", Upload.update_scale);
  }

  $(window).on("resize.danbooru", Upload.update_scale);
  $(document).on("click.danbooru", "#image", Upload.toggle_size);
  $(document).on("click.danbooru", "#upload-image-view-small", Upload.view_small);
  $(document).on("click.danbooru", "#upload-image-view-large", Upload.view_large);
  $(document).on("click.danbooru", "#upload-image-view-full", Upload.view_full);
}

Upload.no_image_available = function(e) {
  $("#a-new").addClass("no-image-available");
}

Upload.view_small = function(e) {
  $("#image").addClass("fit-width fit-height");
  $("#a-new").attr("data-image-size", "small");
  Upload.update_scale();
  e.preventDefault();
}

Upload.view_large = function(e) {
  $("#image").removeClass("fit-height").addClass("fit-width");
  $("#a-new").attr("data-image-size", "large");
  Upload.update_scale();
  e.preventDefault();
}

Upload.view_full = function(e) {
  $("#image").removeClass("fit-width fit-height");
  $("#a-new").attr("data-image-size", "full");
  Upload.update_scale();
  e.preventDefault();
}

Upload.toggle_size = function(e) {
  let window_aspect_ratio = $(window).width() / $(window).height();
  let image_aspect_ratio = $("#image").width() / $("#image").height();
  let image_size = $("#a-new").attr("data-image-size");

  if (image_size === "small" && image_aspect_ratio >= window_aspect_ratio) {
    Upload.view_full(e);
  } else if (image_size === "small" && image_aspect_ratio < window_aspect_ratio) {
    Upload.view_large(e);
  } else if (image_size === "large") {
    Upload.view_small(e);
  } else if (image_size === "full") {
    Upload.view_small(e);
  }
}

Upload.update_scale = function() {
  let $image = $("#image");

  if ($image.length) {
    let natural_width = $image.get(0).naturalWidth;
    let natural_height = $image.get(0).naturalHeight;
    let scale_percentage = Math.round(100 * $image.width() / natural_width);
    $("#upload-image-metadata-resolution").html(`(${natural_width}x${natural_height}, resized to ${scale_percentage}%)`);
  }
}

Upload.toggle_commentary = function() {
  if ($(".artist-commentary").is(":visible")) {
    $("#toggle-artist-commentary").text("show »");
  } else {
    $("#toggle-artist-commentary").text("« hide");
  }

  $(".artist-commentary").slideToggle();
  $(".upload_commentary_translation_container").slideToggle();
};

Upload.toggle_translation = function() {
  if ($(".commentary-translation").is(":visible")) {
    $("#toggle-commentary-translation").text("show »");
  } else {
    $("#toggle-commentary-translation").text("« hide");
  }

  $(".commentary-translation").slideToggle();
};

Upload.initialize_dropzone = function() {
  if (!window.FileReader) {
    $("#filedropzone").remove();
    return;
  }

  let dropzone = new Dropzone(document.body, {
    paramName: "upload[file]",
    url: "/uploads/preprocess",
    clickable: "#filedropzone",
    previewsContainer: "#filedropzone",
    thumbnailHeight: 150,
    thumbnailWidth: 150,
    thumbnailMethod: "contain",
    addRemoveLinks: false,
    maxFiles: 1,
    maxFilesize: Upload.max_file_size(),
    maxThumbnailFilesize: Upload.max_file_size(),
    timeout: 0,
    acceptedFiles: "image/jpeg,image/png,image/gif,video/mp4,video/webm",
    previewTemplate: $("#dropzone-preview-template").html(),
    init: function() {
      $(".fallback").hide();
      this.on("complete", function(file) {
        $("#filedropzone .dz-progress").hide();
      });
      this.on("addedfile", function(file) {
        $("#filedropzone .dropzone-hint").hide();

        // replace the previous file with the new one.
        dropzone.files.forEach(f => {
          if (f !== file) {
            dropzone.removeFile(f);
          }
        });

        let reader = new FileReader();
        reader.addEventListener("loadend", function() {
          let buf = new SparkMD5.ArrayBuffer();
          buf.append(this.result);
          let hash = buf.end();
          $("#upload_md5_confirmation").val(hash);
        });
        reader.readAsArrayBuffer(file);
      });
      this.on("success", function(file) {
        $("#filedropzone").addClass("success");
      });
      this.on("error", function(file, msg) {
        $("#filedropzone").addClass("error");
      });
    }
  });
};

Upload.batch_open_all = function() {
  $(".upload-preview > a").each((_i, link) => window.open(link.href));
};

Upload.max_file_size = function() {
  return Number($("meta[name=max-file-size]").attr("content")) / (1024 * 1024);
};

$(function() {
  Upload.initialize_all();
});

export default Upload
