"""Data shapes of the ingestion pipeline.

The wire format is camelCase (the Zod contract in
`@vozlab/shared-types` wins over the old snake_case examples), so the models
use aliases and the worker sends `model_dump(by_alias=True)`.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from vozlab_worker.streams import PermanentError, StreamMessage


class RawSourceRecord(BaseModel):
    """The envelope produced by the ingestion gateway."""

    model_config = ConfigDict(populate_by_name=True)

    source_id: str = Field(alias="sourceId")
    connector_type: str = Field(alias="connectorType")
    channel_name: str = Field(alias="channelName")
    raw_content: str = Field(alias="rawContent")

    @classmethod
    def from_message(cls, message: StreamMessage) -> RawSourceRecord:
        """Parse the flat stream fields into the record.

        The stream carries flat strings, so the envelope is read field by
        field. A record without a source or without content can never be
        processed: it is a permanent failure, not a retry.
        """
        fields = message.fields
        missing = [
            name
            for name in ("sourceId", "connectorType", "channelName", "rawContent")
            if not fields.get(name, "").strip()
        ]
        if missing:
            raise PermanentError(f"source record is missing {', '.join(missing)}: {sorted(fields)}")

        return cls(
            sourceId=fields["sourceId"].strip(),
            connectorType=fields["connectorType"].strip(),
            channelName=fields["channelName"].strip(),
            rawContent=fields["rawContent"],
        )


class ExtractedNodePayload(BaseModel):
    """What the LLM returns: the draft node the worker will create."""

    model_config = ConfigDict(populate_by_name=True)

    type_key: str = Field(default="Problem", alias="typeKey")
    title: str
    description: str = ""
    attributes: dict[str, Any] = Field(default_factory=dict)
