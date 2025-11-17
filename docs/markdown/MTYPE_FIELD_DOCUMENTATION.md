# MType Field Documentation - Merchant Type

## Field Definition
**MType** = **Merchant Type** - Categorizes merchants by their business model and sales channels

## CSV Field Mapping
- **CSV Column**: `Mtype` 
- **Database Field**: `merchant_type`
- **Purpose**: Merchant Type classification for business analytics and processing

## Value Classifications
- **1**: Online merchants (e-commerce, digital)
- **2**: Retail merchants (physical stores, brick-and-mortar)
- **3**: Mixed merchants (both online and retail channels)
- **Custom**: Other business model types

## Demographics Processing
- **Import Field**: `Mtype` from demographics CSV files
- **Update Logic**: Existing merchants get their MType updated based on ClientMID matching
- **Audit Tracking**: All MType changes tracked with edit_date and updated_by fields

## Current System Status
- **108 merchants** successfully updated with MType = "3" (Mixed) from recent demographics import
- **Processing Performance**: 6.8 merchants/second with zero errors
- **Field Coverage**: 100% MType population from VSB demographic files

## Business Impact
- Enables merchant segmentation by business model
- Supports targeted analytics for different merchant types
- Facilitates processing logic based on merchant categories
- Improves reporting accuracy for retail vs online performance