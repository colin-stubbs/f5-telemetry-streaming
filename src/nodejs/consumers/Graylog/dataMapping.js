/*
 * Copyright 2018. F5 Networks, Inc. See End User License Agreement ("EULA") for
 * license terms. Notwithstanding anything to the contrary in the EULA, Licensee
 * may copy and modify this software product for its internal business purposes.
 * Further, Licensee may upload, publish and distribute the modified version of
 * the software product on devcentral.f5.com.
 */

'use strict';

// Canonical format
function defaultFormat(globalCtx) {
    const data = globalCtx.event.data;
    return {
        version: '1.1',
        host: data.hostname,
        short_message: 'f5.telemetry',
        full_message: data,
        timestamp: data.timestamp,
        _source: 'f5.telemetry',
        _sourcetype: 'f5:telemetry:json',
    };
}

// Old Splunk format
const SOURCE_2_TYPES = {
    'bigip.stats.summary': 'f5:bigip:stats:iapp:json',
    'bigip.tmsh.system_status': 'f5:bigip:status:iapp:json',
    'bigip.tmsh.interface_status': 'f5:bigip:status:iapp:json',
    'bigip.tmsh.disk_usage': 'f5:bigip:status:iapp:json',
    'bigip.tmsh.disk_latency': 'f5:bigip:status:iapp:json',
    'bigip.tmsh.virtual_status': 'f5:bigip:config:iapp:json',
    'bigip.tmsh.pool_member_status': 'f5:bigip:config:iapp:json',
    'bigip.objectmodel.cert': 'f5:bigip:config:iapp:json'
};

function getTemplate(sourceName, data, cache) {
    return {
        version: '1.1',
        host: data.hostname,
        short_message: 'f5.telemetry',
        full_message: {
            aggr_period: data.telemetryServiceInfo.pollingInterval,
            device_base_mac: data.baseMac,
            devicegroup: data.deviceGroup || '',
            facility: data.facility || ''
        },
        timestamp: cache.dataTimestamp,
        _source: sourceName,
        _sourcetype: SOURCE_2_TYPES[sourceName],
    };
}

function getData(request, key) {
    let data = request.globalCtx.event.data[key];
    if (data === undefined || data === 'missing data') {
        data = undefined;
    }
    return data;
}

function overall(request) {
    const data = request.globalCtx.event.data;
    const template = getTemplate('bigip.stats.summary', data, request.cache);
    Object.assign(template.full_message, {
        files_sent: request.results.numberOfRequests,
        bytes_transfered: request.results.dataLength
    });
    return template;
}


const stats = [
    function (request) {
        const data = request.globalCtx.event.data;
        const template = getTemplate('bigip.tmsh.system_status', data, request.cache);
        Object.assign(template.full_message, {
            iapp_version: data.iappVersion,
            version: data.version,
            build: data.versionBuild,
            location: data.location,
            callbackurl: undefined,
            description: data.description,
            'marketing-name': data.marketingName,
            'platform-id': data.platformId,
            'failover-state': data.failoverState,
            'chassis-id': data.chassisId,
            mode: data.syncMode,
            'sync-status': data.syncStatus,
            'sync-summary': data.syncSummary,
            'sync-color': data.syncColor,
            asm_state: data.asmState,
            last_asm_change: data.lastAsmChange,
            apm_state: data.apmState,
            afm_state: data.afmState,
            last_afm_deploy: data.lastAfmDeploy,
            ltm_config_time: data.ltmConfigTime,
            gtm_config_time: data.gtmConfigTime
        });
        return template;
    },

    function (request) {
        const networkInterfaces = getData(request, 'networkInterfaces');
        if (networkInterfaces === undefined) return undefined;

        const template = getTemplate('bigip.tmsh.interface_status', request.globalCtx.event.data, request.cache);
        return Object.keys(networkInterfaces).map((key) => {
            const newData = Object.assign({}, template);
            newData.full_message = Object.assign({}, template.full_message);
            newData.full_message.interface_name = key;
            newData.full_message.interface_status = networkInterfaces[key].status;
            return newData;
        });
    },

    function (request) {
        const diskStorage = getData(request, 'diskStorage');
        if (diskStorage === undefined) return undefined;

        const template = getTemplate('bigip.tmsh.disk_usage', request.globalCtx.event.data, request.cache);
        return Object.keys(diskStorage).map((key) => {
            const newData = Object.assign({}, template);
            newData.full_message = Object.assign({}, diskStorage[key]);
            newData.full_message.Filesystem = key;
            Object.assign(newData.full_message, template.full_message);
            return newData;
        });
    },

    function (request) {
        const diskLatency = getData(request, 'diskLatency');
        if (diskLatency === undefined) return undefined;

        const template = getTemplate('bigip.tmsh.disk_latency', request.globalCtx.event.data, request.cache);
        return Object.keys(diskLatency).map((key) => {
            const newData = Object.assign({}, template);
            newData.full_message = Object.assign({}, diskLatency[key]);
            newData.full_message.Device = key;
            Object.assign(newData.full_message, template.full_message);
            return newData;
        });
    },

    function (request) {
        const tlsCerts = getData(request, 'tlsCerts');
        if (tlsCerts === undefined) return undefined;

        const template = getTemplate('bigip.objectmodel.cert', request.globalCtx.event.data, request.cache);
        return Object.keys(tlsCerts).map((key) => {
            const newData = Object.assign({}, template);
            newData.full_message = Object.assign({}, template.full_message);
            newData.full_message.cert_name = key;
            newData.full_message.cert_subject = tlsCerts[key].subject;
            newData.full_message.cert_expiration_date = tlsCerts[key].expirationDate;
            return newData;
        });
    },

    function (request) {
        const vsStats = getData(request, 'virtualServerStats');
        if (vsStats === undefined) return undefined;

        const template = getTemplate('bigip.tmsh.virtual_status', request.globalCtx.event.data, request.cache);
        return Object.keys(vsStats).map((key) => {
            const vsStat = vsStats[key];
            const newData = Object.assign({}, template);
            newData.full_message = Object.assign({}, template.full_message);
            newData.full_message.virtual_name = key;
            newData.full_message.app = '';
            newData.full_message.appComponent = '';
            newData.full_message.tenant = '';
            newData.full_message.availability_state = vsStat['status.availabilityState'];
            newData.full_message.enabled_state = vsStat['status.enabledState'];
            newData.full_message.status_reason = '';
            return newData;
        });
    },

    function (request) {
        const poolStats = getData(request, 'poolStats');
        if (poolStats === undefined) return undefined;

        const template = getTemplate('bigip.tmsh.pool_member_status', request.globalCtx.event.data, request.cache);
        const output = [];

        Object.keys(poolStats).forEach((poolName) => {
            const poolMembers = poolStats[poolName].members;
            Object.keys(poolMembers).forEach((poolMemberName) => {
                const poolMember = poolMembers[poolMemberName];
                const newData = Object.assign({}, template);
                newData.full_message = Object.assign({}, template.full_message);
                newData.full_message.pool_name = poolName;
                newData.full_message.pool_member_name = poolMemberName;
                newData.full_message.callbackurl = '';
                newData.full_message.address = poolMember.addr;
                newData.full_message.port = poolMember.port;
                newData.full_message.session_status = '';
                newData.full_message.availability_state = poolMember['status.availabilityState'];
                newData.full_message.enabled_state = poolMember['status.enabledState'];
                newData.full_message.status_reason = poolMember['status.statusReason'];
                output.push(newData);
            });
        });
        return output;
    }
];


module.exports = {
    overall,
    stats,
    defaultFormat
};
