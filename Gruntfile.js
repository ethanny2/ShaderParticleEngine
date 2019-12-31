module.exports = function( grunt ) {
    'use strict';

    var packageJSON = grunt.file.readJSON( 'package.json' );

    var licenseBanner =
        '/* ' + packageJSON.name + ' ' + packageJSON.version + '\n' +
        ' * ' + '\n' +
        ' * (c) 2015 Luke Moody (http://www.github.com/squarefeet)' + '\n' +
        ' *     Originally based on Lee Stemkoski\'s original work (https://github.com/stemkoski/stemkoski.github.com/blob/master/Three.js/js/ParticleEngine.js).' + '\n' +
        ' *' + '\n' +
        ' * ' + packageJSON.name + ' may be freely distributed under the MIT license (See LICENSE at root of this repository.)' + '\n */\n';


    // Specify input files and output paths
    var files = [
            'src/index.js',
            // 'src/speIndex.js',
            'src/helpers/TypedArrayHelper.js',
            'src/helpers/ShaderAttribute.js',
            'src/shaders/shaderChunks.js',
            'src/shaders/shaders.js',
            'src/core/utils.js',
            'src/core/Group.js',
            'src/core/Emitter.js'
        ],
        outputPath = 'build/SPE.js',
        outputPathMin = outputPath.replace( '.js', '.min.js' );


    var uglifySettings = {
        min: {
            options: {
                mangle: true,
                exportAll: true,
                compress: {
                    dead_code: true,
                },
                banner: licenseBanner,
                report: 'min',
                maxLineLen: 1000,
            },
            files: {}
        }
    };

    // Set the path for where the minified files should be saved
    uglifySettings.min.files[ outputPathMin ] = [ outputPath ];


    grunt.initConfig( {
        uglify: uglifySettings,
        browserify: {
            dist: {
              src: ['src/**/*.js'],
              dest: 'build/bundle.js',
            }
          },
        concat: {
            options: {
                separator: '\n\n',
                banner: licenseBanner,
            },
            dist: {
                src: files,
                dest: outputPath,
            },
        },

        jsdoc: {
            dist: {
                src: 'src/**/*.js',
                options: {
                    destination: 'docs/api'
                }
            }
        },

        docco: {
            options: {
                dst: 'docs/source/',
                layout: 'parallel'
            },
            docs: {
                src: 'build/SPE.js'
            }
        }
    } );

    grunt.loadNpmTasks( 'grunt-contrib-concat' );
    grunt.loadNpmTasks( 'grunt-contrib-uglify' );
    grunt.loadNpmTasks( 'grunt-jsdoc' );
    grunt.loadNpmTasks( 'grunt-docco2' );
    grunt.loadNpmTasks('grunt-browserify');

    grunt.registerTask( 'default', [ 'concat','browserify', 'uglify' ] );
    grunt.registerTask( 'docs', [ 'jsdoc', 'docco' ] );
};