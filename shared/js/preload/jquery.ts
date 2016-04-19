/**
 * @file Custom jQuery plugins.
 */


/**
 * Calculate absolute coordinates of the boundaries of this element.
 */
self['$'].fn.bounds	= function () : ({
	top: number;
	left: number;
	bottom: number;
	right: number;
}) {
	const bounds: JQueryCoordinates	= this.offset();

	return {
		top: bounds.top,
		left: bounds.left,
		bottom: bounds.top + this.outerHeight(),
		right: bounds.left + this.outerWidth()
	};
};

/**
 * Calculate number of pixels user has scrolled relative to this element.
 */
self['$'].fn.scrollPosition	= function () : number {
	return this[0].scrollHeight -
	(
		this[0].scrollTop +
		this[0].clientHeight
	);
};


let noop: any;
export {noop};
