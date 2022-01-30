"use strict";

const _ = require("lodash");
const uuid = require("uuid");
const { getService } = require("../utils");

module.exports = {
  async save(ctx) {
    const { slug } = ctx.request.params;
    const { body: data } = ctx.request;

    const { createNewVersion } = getService("content-types");

    const model = await strapi.getModel(slug);

    // setup data, get old version and new version number
    let olderVersions = [];
    let publishedId = null
    if (!data.vuid) {
      data.vuid = uuid();
      data.versionNumber = 1;
    } else {
      olderVersions = await strapi.db.query(slug).findMany({
        select: ["id", "vuid", "versionNumber"],
        where: { vuid: data.vuid },
      });

      publishedId = await strapi.db.query(slug).findOne({
        select: ["id", "vuid", "versionNumber"],
        where: { vuid: data.vuid, publishedAt: { $notNull: true } },
      });

      const latestVersion = _.maxBy(olderVersions, (v) => v.versionNumber);
      const latestVersionNumber = latestVersion && latestVersion.versionNumber;
      data.versionNumber = (latestVersionNumber || 0) + 1;

      if (!publishedId) {
        await strapi.db.query(slug).updateMany({
          where: {
            id: {
              $in: olderVersions.map((v) => v.id),
            },
          },
          data: {
            isVisibleInListView: false,
          },
        });
      } 
    }
    data.versions = olderVersions.map((v) => v.id);

    // remove old ids
    const newData = createNewVersion(slug, data);
    const result = await strapi.entityService.create(slug, {
      data: {
        ...newData,
        isVisibleInListView: !publishedId
      },
    });
    for (const version of data.versions) {
      await strapi.db.connection.raw(
        `INSERT INTO ${model.collectionName}_content_versioning_links VALUES (${version},${result.id})`
      );
    }
    return result;
  },
};
