// ShaderParticleEmitter 0.8.0
//
// (c) 2014 Luke Moody (http://www.github.com/squarefeet)
//     & Lee Stemkoski (http://www.adelphi.edu/~stemkoski/)
//
// Based on Lee Stemkoski's original work:
//    (https://github.com/stemkoski/stemkoski.github.com/blob/master/Three.js/js/ParticleEngine.js).
//
// ShaderParticleEmitter may be freely distributed under the MIT license (See LICENSE.txt)

var SPE = SPE || {};

SPE.Emitter = function( options ) {
    // If no options are provided, fallback to an empty object.
    options = options || {};

    // Helps with minification. Not as easy to read the following code,
    // but should still be readable enough!
    var that = this;

    // Any changes to emitter properties will be flagged here,
    // so the next time a particle is reset, updates will be
    // applied.
    that._updateFlags = {};
    that._updateCounts = {};

    that._particleCount = 100;
    that._type = 'cube';

    that._position = new THREE.Vector3();
    that._positionSpread = new THREE.Vector3();

    that._radius = 10.0;
    that._radiusSpread = 0.0;
    that._radiusScale = new THREE.Vector3( 1, 1, 1 );
    that._radiusSpreadClamp = 0.0;

    that._acceleration = new THREE.Vector3();
    that._accelerationSpread = new THREE.Vector3();

    that._velocity = new THREE.Vector3();
    that._velocitySpread = new THREE.Vector3();

    that._speed = 0.0;
    that._speedSpread = 0.0;

    that._sizeStart = 1.0;
    that._sizeStartSpread = 0.0;
    that._sizeEnd = 1.0;
    that._sizeEndSpread = 0.0;

    that._sizeMiddle = Math.abs( that._sizeEnd + that._sizeStart ) / 2;
    that._sizeMiddleSpread = 0.0;

    that._angleStart = 0.0;
    that._angleStartSpread = 0.0;
    that._angleMiddle = 0.0;
    that._angleMiddleSpread = 0.0;
    that._angleEnd = 0.0;
    that._angleEndSpread = 0.0;
    that._angleAlignVelocity = false;

    that._colorStart = new THREE.Color( 'white' );
    that._colorStartSpread = new THREE.Vector3();
    that._colorEnd = that._colorStart.clone();
    that._colorEndSpread = new THREE.Vector3();
    that._colorMiddle = new THREE.Color().addColors( that._colorStart, that._colorEnd ).multiplyScalar( 0.5 );
    that._colorMiddleSpread = new THREE.Vector3();



    // Opacities
    that._opacityStart = 1.0;
    that._opacityStartSpread = 0.0;
    that._opacityEnd = 0.0;
    that._opacityEndSpread = 0.0;
    that._opacityMiddle = Math.abs( that._opacityEnd + that._opacityStart ) / 2;
    that._opacityMiddleSpread = 0.0;


    for ( var i in options ) {
        if ( that.hasOwnProperty( '_' + i ) ) {
            that[ i ] = options[ i ];
        }
    }


    // Generic
    that.duration = typeof options.duration === 'number' ? options.duration : null;
    that.alive = parseFloat( typeof options.alive === 'number' ? options.alive : 1.0 );
    that.isStatic = typeof options.isStatic === 'number' ? options.isStatic : 0;

    // Particle spawn callback function.
    that.onParticleSpawn = typeof options.onParticleSpawn === 'function' ? options.onParticleSpawn : null;


    // The following properties are used internally, and mostly set when this emitter
    // is added to a particle group.
    that.particlesPerSecond = 0;
    that.attributes = null;
    that.vertices = null;
    that.verticesIndex = 0;
    that.age = 0.0;
    that.maxAge = 0.0;

    that.particleIndex = 0.0;
    that.hasRendered = false;

    that.__id = null;

    that.userData = {};
};

SPE.Emitter.prototype = {

    /**
     * Reset a particle's position. Accounts for emitter type and spreads.
     *
     * @private
     *
     * @param  {THREE.Vector3} p
     */
    _resetParticle: function( i ) {
        var that = this,
            type = that._type,
            spread = that.positionSpread,
            particlePosition = that.vertices[ i ],
            a = that.attributes,
            particleVelocity = a.velocity.value[ i ],
            vSpread = that.velocitySpread,
            aSpread = that.accelerationSpread;

        // Optimise for no position spread or radius
        if (
            ( type === 'cube' && spread.x === 0 && spread.y === 0 && spread.z === 0 ) ||
            ( type === 'sphere' && that.radius === 0 ) ||
            ( type === 'disk' && that.radius === 0 )
        ) {
            particlePosition.copy( that.position );
            that.randomizeExistingVector3( particleVelocity, that.velocity, vSpread );
            that.attributes.velocity.needsUpdate = true;

            if ( type === 'cube' ) {
                that.randomizeExistingVector3( that.attributes.acceleration.value[ i ], that.acceleration, aSpread );
                that.attributes.acceleration.needsUpdate = true;
            }
        }

        // If there is a position spread, then get a new position based on this spread.
        else if ( type === 'cube' ) {
            that.randomizeExistingVector3( particlePosition, that.position, spread );
            that.randomizeExistingVector3( particleVelocity, that.velocity, vSpread );
            that.randomizeExistingVector3( that.attributes.acceleration.value[ i ], that.acceleration, aSpread );
            that.attributes.velocity.needsUpdate = true;
            that.attributes.acceleration.needsUpdate = true;
        }

        else if ( type === 'sphere' ) {
            that.randomizeExistingVector3OnSphere( particlePosition, that.position, that.radius, that.radiusSpread, that.radiusScale, that.radiusSpreadClamp );
            that.randomizeExistingVelocityVector3OnSphere( particleVelocity, that.position, particlePosition, that.speed, that.speedSpread );
            that.attributes.velocity.needsUpdate = true;
        }

        else if ( type === 'disk' ) {
            that.randomizeExistingVector3OnDisk( particlePosition, that.position, that.radius, that.radiusSpread, that.radiusScale, that.radiusSpreadClamp );
            that.randomizeExistingVelocityVector3OnSphere( particleVelocity, that.position, particlePosition, that.speed, that.speedSpread );
            that.attributes.velocity.needsUpdate = true;
        }


        that._updateParticlesFromFlags( i );


        if ( typeof that.onParticleSpawn === 'function' ) {
            that.onParticleSpawn( a, i );
        }
    },

    /**
     * When a parameter of this emitter is changed, a flag will be set
     * indicating this. This function takes care of updating the
     * required attributes.
     *
     * It could probably be done a little better than this, but it'll
     * do for now...
     *
     * @private
     *
     * @param  {Number} i Particle index
     */
    _updateParticlesFromFlags: function( i ) {
        if ( !this.hasRendered ) return;

        var that = this,
            flags = that._updateFlags,
            counts = that._updateCounts,
            numParticles = that._particleCount,
            attributes = that.attributes;

        if ( flags.sizeStart === true ) {
            attributes.size.value[ i ].x = Math.abs( that.randomFloat( that.sizeStart, that.sizeStartSpread ) );
            attributes.size.needsUpdate = true;

            if ( ++counts.sizeStart === numParticles ) {
                counts.sizeStart = 0;
                flags.sizeStart = false;
            }
        }

        if ( flags.sizeMiddle === true ) {
            attributes.size.value[ i ].y = Math.abs( that.randomFloat( that.sizeMiddle, that.sizeMiddleSpread ) );
            attributes.size.needsUpdate = true;

            if ( ++counts.sizeMiddle === numParticles ) {
                counts.sizeMiddle = 0;
                flags.sizeMiddle = false;
            }
        }

        if ( flags.sizeEnd === true ) {
            attributes.size.value[ i ].z = Math.abs( that.randomFloat( that.sizeEnd, that.sizeEndSpread ) );
            attributes.size.needsUpdate = true;

            if ( ++counts.sizeEnd === numParticles ) {
                counts.sizeEnd = 0;
                flags.sizeEnd = false;
            }
        }


        if ( flags.colorStart === true ) {
            that.randomizeExistingColor(
                attributes.colorStart.value[ i ], that.colorStart, that.colorStartSpread
            );

            attributes.colorStart.needsUpdate = true;

            if ( ++counts.colorStart === numParticles ) {
                counts.colorStart = 0;
                flags.colorStart = false;
            }
        }

        if ( flags.colorMiddle === true ) {
            that.randomizeExistingColor(
                attributes.colorMiddle.value[ i ], that.colorMiddle, that.colorMiddleSpread
            );

            attributes.colorMiddle.needsUpdate = true;

            if ( ++counts.colorMiddle === numParticles ) {
                counts.colorMiddle = 0;
                flags.colorMiddle = false;
            }
        }

        if ( flags.colorEnd === true ) {
            that.randomizeExistingColor(
                attributes.colorEnd.value[ i ], that.colorEnd, that.colorEndSpread
            );

            attributes.colorEnd.needsUpdate = true;

            if ( ++counts.colorEnd === numParticles ) {
                counts.colorEnd = 0;
                flags.colorEnd = false;
            }
        }



        if ( flags.opacityStart === true ) {
            attributes.opacity.value[ i ].x = Math.abs( that.randomFloat( that.opacityStart, that.opacityStartSpread ) );
            attributes.opacity.needsUpdate = true;

            if ( ++counts.opacityStart === numParticles ) {
                counts.opacityStart = 0;
                flags.opacityStart = false;
            }
        }

        if ( flags.opacityMiddle === true ) {
            attributes.opacity.value[ i ].y = Math.abs( that.randomFloat( that.opacityMiddle, that.opacityMiddleSpread ) );
            attributes.opacity.needsUpdate = true;

            if ( ++counts.opacityMiddle === numParticles ) {
                counts.opacityMiddle = 0;
                flags.opacityMiddle = false;
            }
        }

        if ( flags.opacityEnd === true ) {
            attributes.opacity.value[ i ].z = Math.abs( that.randomFloat( that.opacityEnd, that.opacityEndSpread ) );
            attributes.opacity.needsUpdate = true;

            if ( ++counts.opacityEnd === numParticles ) {
                counts.opacityEnd = 0;
                flags.opacityEnd = false;
            }
        }


        if ( flags.angleStart === true ) {
            attributes.angle.value[ i ].x = Math.abs( that.randomFloat( that.angleStart, that.angleStartSpread ) );
            attributes.angle.needsUpdate = true;

            if ( ++counts.angleStart === numParticles ) {
                counts.angleStart = 0;
                flags.angleStart = false;
            }
        }

        if ( flags.angleMiddle === true ) {
            attributes.angle.value[ i ].y = Math.abs( that.randomFloat( that.angleMiddle, that.angleMiddleSpread ) );
            attributes.angle.needsUpdate = true;

            if ( ++counts.angleMiddle === numParticles ) {
                counts.angleMiddle = 0;
                flags.angleMiddle = false;
            }
        }

        if ( flags.angleEnd === true ) {
            attributes.angle.value[ i ].z = Math.abs( that.randomFloat( that.angleEnd, that.angleEndSpread ) );
            attributes.angle.needsUpdate = true;

            if ( ++counts.angleEnd === numParticles ) {
                counts.angleEnd = 0;
                flags.angleEnd = false;
            }
        }
    },

    /**
     * Update this emitter's particle's positions. Called by the SPE.Group
     * that this emitter belongs to.
     *
     * @param  {Number} dt
     */
    tick: function( dt ) {
        this.hasRendered = true;

        if ( this.isStatic ) {
            return;
        }

        // Cache some values for quicker access in loops.
        var that = this,
            a = that.attributes,
            alive = a.alive.value,
            age = a.age.value,
            start = that.verticesIndex,
            particleCount = that._particleCount,
            end = start + particleCount,
            pps = that.particlesPerSecond * that.alive,
            ppsdt = pps * dt,
            m = that.maxAge,
            emitterAge = that.age,
            duration = that.duration,
            pIndex = that.particleIndex;

        // Loop through all the particles in this emitter and
        // determine whether they're still alive and need advancing
        // or if they should be dead and therefore marked as such.
        for ( var i = start; i < end; ++i ) {
            if ( alive[ i ] === 1.0 ) {
                age[ i ] += dt;
            }

            if ( age[ i ] >= m ) {
                age[ i ] = 0.0;
                alive[ i ] = 0.0;
            }
        }

        // If the emitter is dead, reset any particles that are in
        // the recycled vertices array and reset the age of the
        // emitter to zero ready to go again if required, then
        // exit this function.
        if ( that.alive === 0.0 ) {
            that.age = 0.0;
            return;
        }

        // If the emitter has a specified lifetime and we've exceeded it,
        // mark the emitter as dead and exit this function.
        if ( typeof duration === 'number' && emitterAge > duration ) {
            that.alive = 0.0;
            that.age = 0.0;
            return;
        }



        var n = Math.max( Math.min( end, pIndex + ppsdt ), 0 ),
            count = 0,
            index = 0,
            pIndexFloor = pIndex | 0,
            dtInc;

        for ( i = pIndexFloor; i < n; ++i ) {
            if ( alive[ i ] !== 1.0 ) {
                ++count;
            }
        }

        if ( count !== 0 ) {
            dtInc = dt / count;

            for ( i = pIndexFloor; i < n; ++i, ++index ) {
                if ( alive[ i ] !== 1.0 ) {
                    alive[ i ] = 1.0;
                    age[ i ] = dtInc * index;
                    that._resetParticle( i );
                }
            }
        }

        that.particleIndex += ppsdt;

        if ( that.particleIndex < 0.0 ) {
            that.particleIndex = 0.0;
        }

        if ( pIndex >= start + particleCount ) {
            that.particleIndex = parseFloat( start );
        }

        // Add the delta time value to the age of the emitter.
        that.age += dt;

        if ( that.age < 0.0 ) {
            that.age = 0.0;
        }
    },

    /**
     * Reset this emitter back to its starting position.
     * If `force` is truthy, then reset all particles in this
     * emitter as well, even if they're currently alive.
     *
     * @param  {Boolean} force
     * @return {this}
     */
    reset: function( force ) {
        var that = this;

        that.age = 0.0;
        that.alive = 0;

        if ( force ) {
            var start = that.verticesIndex,
                end = that.verticesIndex + that._particleCount,
                a = that.attributes,
                alive = a.alive.value,
                age = a.age.value;

            for ( var i = start; i < end; ++i ) {
                alive[ i ] = 0.0;
                age[ i ] = 0.0;
            }
        }

        return that;
    },


    /**
     * Enable this emitter.
     */
    enable: function() {
        this.alive = 1;
    },

    /**
     * Disable this emitter.
     */
    disable: function() {
        this.alive = 0;
    }
};



Object.defineProperty( SPE.Emitter.prototype, 'type', {
    get: function() {
        return this._type;
    },
    set: function( value ) {
        if ( value === 'cube' || value === 'sphere' || value === 'disk' ) {
            this._type = value;
            this._updateFlags.type = true;
        }
        else {
            console.warn( 'Invalid emitter type: ' + value + '. Emitter type not changed from "' + this._type + '"' );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'particleCount', {
    get: function() {
        return this._particleCount;
    },
    set: function( value ) {
        if ( typeof value === 'number' && value >= 1 ) {
            this._particleCount = Math.round( value );

            if ( this.geometry ) {
                this.geometry.verticesNeedUpdate = true;
            }
        }
        else {
            console.warn( 'Invalid particleCount specified: ' + value + '. Must be a number >= 1. ParticleCount remains at: ' + this._particleCount );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'position', {
    get: function() {
        return this._position;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._position = value;
        }
        else {
            console.warn( 'Invalid position specified. Must be instance of THREE.Vector3.' );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'positionSpread', {
    get: function() {
        return this._positionSpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._positionSpread = value;
        }
        else {
            console.warn( 'Invalid positionSpread specified. Must be instance of THREE.Vector3.' );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'radius', {
    get: function() {
        return this._radius;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._radius = value;
        }
        else {
            console.warn( 'Invalid radius specified: ' + value + '. Must be a number. radius remains at: ' + this._radius );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'radiusSpread', {
    get: function() {
        return this._radiusSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._radiusSpread = value;
        }
        else {
            console.warn( 'Invalid radiusSpread specified: ' + value + '. Must be a number. radiusSpread remains at: ' + this._radiusSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'radiusScale', {
    get: function() {
        return this._radiusScale;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._radiusScale = value;
        }
        else {
            console.warn( 'Invalid radiusScale specified. Must be instance of THREE.Vector3.' );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'radiusSpreadClamp', {
    get: function() {
        return this._radiusSpreadClamp;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._radiusSpreadClamp = value;
        }
        else {
            console.warn( 'Invalid radiusSpreadClamp specified: ' + value + '. Must be a number. radiusSpreadClamp remains at: ' + this._radiusSpreadClamp );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'acceleration', {
    get: function() {
        return this._acceleration;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._acceleration = value;
        }
        else {
            console.warn( 'Invalid acceleration specified. Must be instance of THREE.Vector3.' );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'accelerationSpread', {
    get: function() {
        return this._accelerationSpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._accelerationSpread = value;
        }
        else {
            console.warn( 'Invalid accelerationSpread specified. Must be instance of THREE.Vector3.' );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'velocity', {
    get: function() {
        return this._velocity;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._velocity = value;
        }
        else {
            console.warn( 'Invalid velocity specified. Must be instance of THREE.Vector3.' );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'velocitySpread', {
    get: function() {
        return this._velocitySpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._velocitySpread = value;
        }
        else {
            console.warn( 'Invalid velocitySpread specified. Must be instance of THREE.Vector3.' );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'speed', {
    get: function() {
        return this._speed;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._speed = value;
        }
        else {
            console.warn( 'Invalid speed specified: ' + value + '. Must be a number. speed remains at: ' + this._speed );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'speedSpread', {
    get: function() {
        return this._speedSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._speedSpread = value;
        }
        else {
            console.warn( 'Invalid speedSpread specified: ' + value + '. Must be a number. speedSpread remains at: ' + this._speedSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'sizeStart', {
    get: function() {
        return this._sizeStart;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeStart = value;
            this._updateFlags.sizeStart = true;
            this._updateCounts.sizeStart = 0;
        }
        else {
            console.warn( 'Invalid sizeStart specified: ' + value + '. Must be a number. sizeStart remains at: ' + this._sizeStart );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'sizeStartSpread', {
    get: function() {
        return this._sizeStartSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeStartSpread = value;
            this._updateFlags.sizeStart = true;
            this._updateCounts.sizeStart = 0;
        }
        else {
            console.warn( 'Invalid sizeStartSpread specified: ' + value + '. Must be a number. sizeStartSpread remains at: ' + this._sizeStartSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'sizeMiddle', {
    get: function() {
        return this._sizeMiddle;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeMiddle = value;
        }
        else {
            this._sizeMiddle = Math.abs( this._sizeEnd + this._sizeStart );
        }

        this._updateFlags.sizeMiddle = true;
        this._updateCounts.sizeMiddle = 0;
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'sizeMiddleSpread', {
    get: function() {
        return this._sizeMiddleSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeMiddleSpread = value;
            this._updateFlags.sizeMiddle = true;
            this._updateCounts.sizeMiddle = 0;
        }
        else {
            console.warn( 'Invalid sizeMiddleSpread specified: ' + value + '. Must be a number. sizeMiddleSpread remains at: ' + this._sizeMiddleSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'sizeEnd', {
    get: function() {
        return this._sizeEnd;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeEnd = value;
            this._updateFlags.sizeEnd = true;
            this._updateCounts.sizeEnd = 0;
        }
        else {
            console.warn( 'Invalid sizeEnd specified: ' + value + '. Must be a number. sizeEnd remains at: ' + this._sizeEnd );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'sizeEndSpread', {
    get: function() {
        return this._sizeEndSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._sizeEndSpread = value;
            this._updateFlags.sizeEnd = true;
            this._updateCounts.sizeEnd = 0;
        }
        else {
            console.warn( 'Invalid sizeEndSpread specified: ' + value + '. Must be a number. sizeEndSpread remains at: ' + this._sizeEndSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'colorStart', {
    get: function() {
        return this._colorStart;
    },
    set: function( value ) {
        if ( value instanceof THREE.Color ) {
            this._colorStart = value;
            this._updateFlags.colorStart = true;
            this._updateCounts.colorStart = 0;
        }
        else {
            console.warn( 'Invalid colorStart specified: ' + value + '. Must be instance of THREE.Color. colorStart remains at: ' + this._colorStart );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'colorStartSpread', {
    get: function() {
        return this._colorStartSpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._colorStartSpread = value;
            this._updateFlags.colorStart = true;
            this._updateCounts.colorStart = 0;
        }
        else {
            console.warn( 'Invalid colorStartSpread specified: ' + value + '. Must be instance of THREE.Vector3. colorStartSpread remains at: ' + this._colorStartSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'colorMiddle', {
    get: function() {
        return this._colorMiddle;
    },
    set: function( value ) {
        if ( value instanceof THREE.Color === false ) {
            value = this._colorMiddle.addColors( this._colorStart, this._colorEnd ).multiplyScalar( 0.5 );
        }
        else if ( value instanceof THREE.Color ) {
            this._colorMiddle = value;
        }

        this._updateFlags.colorMiddle = true;
        this._updateCounts.colorMiddle = 0;
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'colorMiddleSpread', {
    get: function() {
        return this._colorMiddleSpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._colorMiddleSpread = value;
            this._updateFlags.colorMiddle = true;
            this._updateCounts.colorMiddle = 0;
        }
        else {
            console.warn( 'Invalid colorMiddleSpread specified: ' + value + '. Must be a number. colorMiddleSpread remains at: ' + this._colorMiddleSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'colorEnd', {
    get: function() {
        return this._colorEnd;
    },
    set: function( value ) {
        if ( value instanceof THREE.Color ) {
            this._colorEnd = value;
            this._updateFlags.colorEnd = true;
            this._updateCounts.colorEnd = 0;
        }
        else {
            console.warn( 'Invalid colorEnd specified: ' + value + '. Must be instance of THREE.Color. colorEnd remains at: ' + this._colorEnd );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'colorEndSpread', {
    get: function() {
        return this._colorEndSpread;
    },
    set: function( value ) {
        if ( value instanceof THREE.Vector3 ) {
            this._colorEndSpread = value;
            this._updateFlags.colorEnd = true;
            this._updateCounts.colorEnd = 0;
        }
        else {
            console.warn( 'Invalid colorEndSpread specified: ' + value + '. Must be instance of THREE.Vector3. colorEndSpread remains at: ' + this._colorEndSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'opacityStart', {
    get: function() {
        return this._opacityStart;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityStart = value;
            this._updateFlags.opacityStart = true;
            this._updateCounts.opacityStart = 0;
        }
        else {
            console.warn( 'Invalid opacityStart specified: ' + value + '. Must be a number. opacityStart remains at: ' + this._opacityStart );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'opacityStartSpread', {
    get: function() {
        return this._opacityStartSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityStartSpread = value;
            this._updateFlags.opacityStart = true;
            this._updateCounts.opacityStart = 0;
        }
        else {
            console.warn( 'Invalid opacityStartSpread specified: ' + value + '. Must be a number. opacityStartSpread remains at: ' + this._opacityStartSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'opacityMiddle', {
    get: function() {
        return this._opacityMiddle;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityMiddle = value;
        }
        else {
            this._opacityMiddle = Math.abs( this._opacityEnd + this._opacityStart );
        }

        this._updateFlags.opacityMiddle = true;
        this._updateCounts.opacityMiddle = 0;
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'opacityMiddleSpread', {
    get: function() {
        return this._opacityMiddleSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityMiddleSpread = value;
            this._updateFlags.opacityMiddle = true;
            this._updateCounts.opacityMiddle = 0;
        }
        else {
            console.warn( 'Invalid opacityMiddleSpread specified: ' + value + '. Must be a number. opacityMiddleSpread remains at: ' + this._opacityMiddleSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'opacityEnd', {
    get: function() {
        return this._opacityEnd;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityEnd = value;
            this._updateFlags.opacityEnd = true;
            this._updateCounts.opacityEnd = 0;
        }
        else {
            console.warn( 'Invalid opacityEnd specified: ' + value + '. Must be a number. opacityEnd remains at: ' + this._opacityEnd );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'opacityEndSpread', {
    get: function() {
        return this._opacityEndSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._opacityEndSpread = value;
            this._updateFlags.opacityEnd = true;
            this._updateCounts.opacityEnd = 0;
        }
        else {
            console.warn( 'Invalid opacityEndSpread specified: ' + value + '. Must be a number. opacityEndSpread remains at: ' + this._opacityEndSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'angleStart', {
    get: function() {
        return this._angleStart;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleStart = value;
            this._updateFlags.angleStart = true;
            this._updateCounts.angleStart = 0;
        }
        else {
            console.warn( 'Invalid angleStart specified: ' + value + '. Must be a number. angleStart remains at: ' + this._angleStart );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'angleStartSpread', {
    get: function() {
        return this._angleStartSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleStartSpread = value;
            this._updateFlags.angleStart = true;
            this._updateCounts.angleStart = 0;
        }
        else {
            console.warn( 'Invalid angleStartSpread specified: ' + value + '. Must be a number. angleStartSpread remains at: ' + this._angleStartSpread );
        }
    }
} );


Object.defineProperty( SPE.Emitter.prototype, 'angleMiddle', {
    get: function() {
        return this._angleMiddle;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleMiddle = value;
        }
        else {
            this._angleMiddle = Math.abs( this._angleEnd + this._angleStart );
        }

        this._updateFlags.angleMiddle = true;
        this._updateCounts.angleMiddle = 0;
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'angleMiddleSpread', {
    get: function() {
        return this._angleMiddleSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleMiddleSpread = value;
            this._updateFlags.angleMiddle = true;
            this._updateCounts.angleMiddle = 0;
        }
        else {
            console.warn( 'Invalid angleMiddleSpread specified: ' + value + '. Must be a number. angleMiddleSpread remains at: ' + this._angleMiddleSpread );
        }
    }
} );

Object.defineProperty( SPE.Emitter.prototype, 'angleEnd', {
    get: function() {
        return this._angleEnd;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleEnd = value;
            this._updateFlags.angleEnd = true;
            this._updateCounts.angleEnd = 0;
        }
        else {
            console.warn( 'Invalid angleEnd specified: ' + value + '. Must be a number. angleEnd remains at: ' + this._angleEnd );
        }
    }
} );
Object.defineProperty( SPE.Emitter.prototype, 'angleEndSpread', {
    get: function() {
        return this._angleEndSpread;
    },
    set: function( value ) {
        if ( typeof value === 'number' ) {
            this._angleEndSpread = value;
            this._updateFlags.angleEndSpread = true;
            this._updateCounts.angleEndSpread = 0;
        }
        else {
            console.warn( 'Invalid angleEndSpread specified: ' + value + '. Must be a number. angleEndSpread remains at: ' + this._angleEndSpread );
        }
    }
} );


// Extend SPE.Emitter's prototype with functions from utils object.
for ( var i in SPE.utils ) {
    SPE.Emitter.prototype[ i ] = SPE.utils[ i ];
}