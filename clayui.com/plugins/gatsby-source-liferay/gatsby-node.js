/**
 * SPDX-FileCopyrightText: © 2024 Liferay, Inc. <https://liferay.com>
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {Headers, fetch} = require('fetch-undici');

const fetchLiferay = async (slug, siteId, host) => {
	const response = await fetch(
		new URL(
			`/o/headless-delivery/v1.0/sites/${siteId}/site-pages${slug}`,
			host
		),
		{
			headers: new Headers({
				'User-Agent': 'Clay',
				'content-type': 'application/json',
			}),
		}
	);

	const {status} = response;

	const responseContentType = response.headers.get('content-type');

	if (!response.ok || status === 204) {
		throw new Error('Error to Liferay fetch.');
	} else if (response.ok && responseContentType === 'application/json') {
		return response.json();
	} else {
		const data = await response.text();

		return data;
	}
};

const convertTimestamps = (nextObj, prevObj, prevKey) => {
	if (typeof nextObj === `object`) {
		Object.keys(nextObj).map((key) =>
			convertTimestamps(nextObj[key], nextObj, key)
		);
	} else {
		if (typeof nextObj === `number` && nextObj >> 0 !== nextObj) {
			const date = new Date(nextObj);
			if (date.getTime() === nextObj) {
				prevObj[prevKey] = date.toISOString().slice(0, 10);
			}
		}
	}
};

exports.sourceNodes = async (
	{actions, createContentDigest, createNodeId},
	{host, siteId}
) => {
	const {createNode} = actions;

	try {
		const {items} = await fetchLiferay('', siteId, host);

		const resources = await Promise.all(
			items
				.filter(
					(resource) => !['Home', 'Search'].includes(resource.title)
				)
				.map(async (resource) => {
					const html = await fetchLiferay(
						`${resource.friendlyUrlPath}/rendered-page`,
						siteId,
						host
					);

					return {
						dateCreated: resource.dateCreated,
						dateModified: resource.dateModified,
						datePublished: resource.datePublished,
						html,
						id: createNodeId(resource.uuid),
						liferay_id: resource.uuid,
						slug: resource.friendlyUrlPath,
						title: resource.title,
						type: 'LiferayDocument',
					};
				})
		);

		resources.map((resource) => {
			convertTimestamps(resource);

			const contentDigest = createContentDigest(resource);

			const node = {
				...resource,
				children: [],
				internal: {
					contentDigest,
					type: `LiferayDocument`,
				},
				parent: null,
			};

			createNode(node);
		});
	} catch (error) {
		console.error(error);
		process.exit(1);
	}
};

exports.createSchemaCustomization = async ({actions}) => {
	const typeDefs = `
    type LiferayDocument implements Node {
      title: String
      slug: String
      html: String
      dateCreated: Date @dateformat
      dateModified: Date @dateformat
      datePublished: Date @dateformat
      liferay_id: String
      type: String
    }
  `;

	actions.createTypes(typeDefs);
};
