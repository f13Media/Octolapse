/*
##################################################################################
# Octolapse - A plugin for OctoPrint used for making stabilized timelapse videos.
# Copyright (C) 2017  Brad Hochgesang
##################################################################################
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see the following:
# https://github.com/FormerLurker/Octolapse/blob/master/LICENSE
#
# You can contact the author either through the git-hub repository, or at the
# following email address: FormerLurker@pm.me
##################################################################################
*/
$(function() {
    WatermarkImage = function(filepath) {
        var self = this;
        // The full file path on the OctoPrint server.
        self.filepath = filepath;

        // Returns just the filename portion from a full filepath.
        self.getFilename = function() {
            // Function stolen from https://stackoverflow.com/a/25221100.
            return self.filepath.split('\\').pop().split('/').pop();
        };
    }

    Octolapse.RenderingProfileViewModel = function (values) {
        var self = this;
        self.profileTypeName = ko.observable("Render")
        self.guid = ko.observable(values.guid);
        self.name = ko.observable(values.name);
        self.description = ko.observable(values.description);
        self.enabled = ko.observable(values.enabled);
        self.fps_calculation_type = ko.observable(values.fps_calculation_type);
        self.run_length_seconds = ko.observable(values.run_length_seconds);
        self.fps = ko.observable(values.fps);
        self.max_fps = ko.observable(values.max_fps);
        self.min_fps = ko.observable(values.min_fps);
        self.output_format = ko.observable(values.output_format);
        self.sync_with_timelapse = ko.observable(values.sync_with_timelapse);
        self.bitrate = ko.observable(values.bitrate);
        self.flip_h = ko.observable(values.flip_h);
        self.flip_v = ko.observable(values.flip_v);
        self.rotate_90 = ko.observable(values.rotate_90);
        self.post_roll_seconds = ko.observable(values.post_roll_seconds);
        self.pre_roll_seconds = ko.observable(values.pre_roll_seconds);
        self.output_template = ko.observable(values.output_template);
        self.enable_watermark = ko.observable(values.enable_watermark);
        self.selected_watermark = ko.observable(values.selected_watermark); // Absolute filepath of the selected watermark.
        self.watermark_list = ko.observableArray(); // A list of WatermarkImages that are available for selection on the server.

        // This function is called when the Edit Profile dialog shows.
        self.onShow = function() {
             self.updateWatermarkList();
             self.initWatermarkUploadButton();
        };

        self.selectWatermark = function(watermark_image) {
            if (watermark_image === undefined) {
                self.enable_watermark(false);
                self.selected_watermark("");
            }
            self.enable_watermark(true);
            self.selected_watermark(watermark_image.filepath);
        }

        self.deleteWatermark = function(watermarkImage, event) {
            OctoPrint.postJson(OctoPrint.getBlueprintUrl('octolapse') +
                'rendering/watermark/delete', {'path': watermarkImage.filepath}, {'Content-Type':'application/json'})
                    .then(function(response) {
                        // Deselect the watermark if we just deleted the selected watermark.
                        if (self.selected_watermark() == watermarkImage.filepath) {
                            self.selectWatermark();
                        }
                        self.updateWatermarkList();
                    }, function(response) {
                        // TODO: Display error message in UI.
                        console.log("Failed to delete " + watermarkImage.filepath);
                        console.log(response);
                    });
            event.stopPropagation();
        };

        // Load watermark list from server-side Octolapse directory.
        self.updateWatermarkList = function() {
             return OctoPrint.get(OctoPrint.getBlueprintUrl('octolapse') +
                'rendering/watermark')
                    .then(function(response) {
                        self.watermark_list.removeAll()
                        for (let file of response['filepaths']) {
                            self.watermark_list.push(new WatermarkImage(file));
                        }
                     }, function(response) {
                        self.watermark_list.removeAll()
                        // Hacky solution, but good enough. We shouldn't encounter this error too much anyways.
                        self.watermark_list.push(new WatermarkImage("Failed to load watermarks from Octolapse data directory."));
                     });
        }

        self.initWatermarkUploadButton = function() {
             // Set up the file upload button.
             var $watermarkUploadElement = $('#octolapse_watermark_path_upload');
             var $progressBarContainer = $('#octolapse-upload-watermark-progress');
             var $progressBar = $progressBarContainer.find('.progress-bar');

             $watermarkUploadElement.fileupload({
                dataType: "json",
                maxNumberOfFiles: 1,
                headers: OctoPrint.getRequestHeaders(),
                // Need to chunk large image files or else OctoPrint/Flask will reject them.
                // TODO: Octoprint limits file upload size on a per-endpoint basis.
                // http://docs.octoprint.org/en/master/plugins/hooks.html#octoprint-server-http-bodysize
                maxChunkSize: 100000,
                progressall: function (e, data) {
                    // TODO: Get a better progress bar implementation.
                    var progress = parseInt(data.loaded / data.total * 100, 10);
                    $progressBar.text(progress + "%");
                    $progressBar.animate({'width': progress + '%'}, {'queue':false});
                },
                done: function(e, data) {
                    $progressBar.text("Done!");
                    $progressBar.animate({'width': '100%'}, {'queue':false});
                    self.updateWatermarkList().then(function() {
                        // Find the new watermark in the list and select it.
                        var matchingWatermarks = self.watermark_list().filter(w=>w.getFilename() == data.files[0].name);
                        if (matchingWatermarks.length == 0) {
                            console.log("Error: No matching watermarks found!");
                            return
                        }
                        if (matchingWatermarks > 1){
                            console.log("Error: More than one matching watermark found! Selecting best guess.");
                        }
                        self.selectWatermark(matchingWatermarks[0]);
                    });
                },
                fail: function(e, data) {
                    $progressBar.text("Failed...").addClass('failed');
                    $progressBar.animate({'width': '100%'}, {'queue':false});
                }
             });
        }
    };
    Octolapse.RenderingProfileValidationRules = {
        rules: {
            bitrate: { required: true, ffmpegBitRate: true },
            output_template: {
                remote: {
                    url: "./plugin/octolapse/validateRenderingTemplate",
                    type:"post"
                }
            },
            min_fps: { lessThanOrEqual: '#octolapse_rendering_max_fps' },
            max_fps: { greaterThanOrEqual: '#octolapse_rendering_min_fps' }
        },
        messages: {
            name: "Please enter a name for your profile",
            min_fps: { lessThanOrEqual: 'Must be less than or equal to the maximum fps.' },
            max_fps: { greaterThanOrEqual: 'Must be greater than or equal to the minimum fps.' },
            output_template: { octolapseRenderingTemplate: 'Either there is an invalid token in the rendering template, or the resulting file name is not valid.' }
        }
    };
});


