/// <reference path="templates.ts" />


module Cyph {
	export module UI {
		export module Directives {
			/**
			 * Angular directive for Cyph Pro component.
			 */
			export class Pro {
				/** Module/directive title. */
				public static title: string	= 'cyphPro';

				private static _	= (() => {
					angular.module(Pro.title, []).directive(Pro.title, () => ({
						restrict: 'A',
						scope: {
							$this: '=' + Pro.title
						},
						link: scope => scope['Cyph'] = Cyph,
						template: Templates.pro
					}));
				})();
			}
		}
	}
}